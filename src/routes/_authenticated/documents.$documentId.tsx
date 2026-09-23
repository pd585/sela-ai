import { createFileRoute, Link, redirect, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  assembleChunks,
  batchIndices,
  collectMemoChunkIndices,
  computeChunkWindow,
  initialChunkWindow,
  mergeChunkContent,
  stabilizeChunkWindow,
  type ChunkContent,
  type ChunkMeta,
  type ChunkWindow,
} from "@/lib/chunk-window";
import {
  askDocument,
  explainWithSela,
  translateSelaVersion,
  type Citation,
  type ClauseFinding,
  type DocumentOverview,
  type IssueFinding,
  type KeyTerm,
  type SelaVersion,
  type SelaVersionSection,
  type VisualIntelligence,
} from "@/lib/sela.functions";
import { AppShell } from "@/components/sela/shell";
import { DocumentAskPanel } from "@/components/sela/document-ask-panel";
import { DocumentVersionPanel } from "@/components/sela/document-version-panel";
import { DocumentEvidenceSheet } from "@/components/sela/document-evidence-sheet";
import { Empty, LANGUAGE_LABELS, VisualDiagramCard } from "@/components/sela/document-shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BookOpen, Download, HelpCircle, Quote, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/documents/$documentId/review",
      params: { documentId: params.documentId },
    });
  },
  head: () => ({
    meta: [
      { title: "Document review · SELA" },
      {
        name: "description",
        content:
          "Read SELA'S VERSION, compare with the original document, inspect clauses, and ask grounded questions with verified sources.",
      },
      { property: "og:title", content: "Document review · SELA" },
      {
        property: "og:description",
        content:
          "Read SELA'S VERSION, compare with the original document, inspect clauses, and ask grounded questions with verified sources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentReview,
});

type Chunk = ChunkContent;
type QuestionRow = {
  id: string;
  question: string;
  answer: string;
  citations: Citation[] | null;
  sufficient: boolean | null;
  follow_ups?: string[];
  external_verification?: {
    status: string;
    summary: string;
    how_they_relate?: string;
    sources?: Array<{ title: string; url: string; published_date?: string }>;
  } | null;
  created_at: string;
};

export function DocumentReview() {
  const { documentId } = useParams({ strict: false }) as { documentId?: string };
  const activeDocumentId = documentId ?? "";
  const queryClient = useQueryClient();

  // State for Ask SELA
  const [question, setQuestion] = useState("");
  const [verifyExternal, setVerifyExternal] = useState(false);
  const [searchMode, setSearchMode] = useState<"document" | "both" | "external">("document");
  const [asking, setAsking] = useState(false);

  // Source Drawer state
  const [openSource, setOpenSource] = useState<{ page: number; text: string } | null>(null);

  // Explain with SELA state
  const [explaining, setExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<SelaVersionSection | null>(null);
  const [openExplainDrawer, setOpenExplainDrawer] = useState(false);

  // Multilingual SELA'S VERSION state
  const [selaLanguage, setSelaLanguage] = useState<"en" | "te" | "hi" | "ml" | "kn">("en");
  const [translatingLanguage, setTranslatingLanguage] = useState(false);
  const [translatedSections, setTranslatedSections] = useState<SelaVersionSection[] | null>(null);
  const [languageCache, setLanguageCache] = useState<Record<string, SelaVersionSection[]>>({});

  // Side-by-side mode toggle for SELA'S VERSION tab (off by default so first paint skips full chunk bodies)
  const [sideBySide, setSideBySide] = useState(false);
  const [activeTab, setActiveTab] = useState("sela-version");
  const [chunkWindow, setChunkWindow] = useState<ChunkWindow | null>(null);
  const [loadedChunkMap, setLoadedChunkMap] = useState<Map<number, ChunkContent>>(() => new Map());
  const passageListRef = useRef<HTMLDivElement | null>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evidenceTriggerRef = useRef<HTMLElement | null>(null);

  // Copied state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", activeDocumentId],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error("You are not signed in.");

      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, title, file_name, page_count, status, status_detail, overview, key_terms, clauses, issues",
        )
        .eq("id", activeDocumentId)
        .eq("user_id", session.user.id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const needWindowedContent = sideBySide || activeTab === "original";

  const { data: chunkMeta = [] } = useQuery({
    queryKey: ["chunks-meta", activeDocumentId],
    queryFn: async (): Promise<ChunkMeta[]> => {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("chunk_index, page_number")
        .eq("document_id", activeDocumentId)
        .order("chunk_index", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeDocumentId),
  });

  // Reset loaded content when switching documents.
  useEffect(() => {
    setLoadedChunkMap(new Map());
    setChunkWindow(null);
  }, [activeDocumentId]);

  // Open Original / side-by-side with a bounded top window (not the full corpus).
  useEffect(() => {
    if (!needWindowedContent || chunkMeta.length === 0) return;
    setChunkWindow((prev) => prev ?? initialChunkWindow(chunkMeta.length));
  }, [needWindowedContent, chunkMeta.length]);

  const activeWindow = chunkWindow;

  const { isFetching: fetchingWindowChunks } = useQuery({
    queryKey: [
      "chunks-content-window",
      activeDocumentId,
      activeWindow?.start ?? -1,
      activeWindow?.end ?? -1,
    ],
    queryFn: async (): Promise<Chunk[]> => {
      if (!activeWindow) return [];
      const { data, error } = await supabase
        .from("document_chunks")
        .select("chunk_index, page_number, content")
        .eq("document_id", activeDocumentId)
        .gte("chunk_index", activeWindow.start)
        .lte("chunk_index", activeWindow.end)
        .order("chunk_index", { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Chunk[];
      setLoadedChunkMap((prev) => mergeChunkContent(prev, rows));
      return rows;
    },
    enabled: Boolean(activeDocumentId) && needWindowedContent && Boolean(activeWindow),
    staleTime: 60_000,
  });

  const chunks: Chunk[] = useMemo(
    () => assembleChunks(chunkMeta, loadedChunkMap),
    [chunkMeta, loadedChunkMap],
  );

  const fetchingFullChunks = fetchingWindowChunks;

  const onPassageScroll = useCallback(() => {
    const el = passageListRef.current;
    if (!el || chunkMeta.length === 0) return;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const children = Array.from(el.querySelectorAll<HTMLElement>("[data-chunk-index]"));
      if (children.length === 0) return;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;
      let first = chunkMeta.length - 1;
      let last = 0;
      for (const child of children) {
        const top = child.offsetTop;
        const bottom = top + child.offsetHeight;
        const idx = Number(child.dataset["chunkIndex"]);
        if (!Number.isFinite(idx)) continue;
        if (bottom >= viewTop && top <= viewBottom) {
          first = Math.min(first, idx);
          last = Math.max(last, idx);
        }
      }
      if (last < first) {
        first = 0;
        last = Math.min(29, chunkMeta.length - 1);
      }
      const next = computeChunkWindow(first, last, chunkMeta.length);
      setChunkWindow((prev) => stabilizeChunkWindow(prev, next));
    }, 120);
  }, [chunkMeta.length]);

  const { data: questions = [] } = useQuery({
    queryKey: ["questions", activeDocumentId],
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data, error } = await supabase
        .from("document_questions")
        .select("id, question, answer, citations, sufficient, created_at")
        .eq("document_id", activeDocumentId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => {
        const citationsObj = row["citations"] as
          | {
              list?: Citation[];
              external_verification?: QuestionRow["external_verification"];
              follow_ups?: string[];
            }
          | Citation[]
          | null;
        if (citationsObj && !Array.isArray(citationsObj) && typeof citationsObj === "object") {
          return {
            ...row,
            citations: citationsObj.list || [],
            external_verification: citationsObj.external_verification || null,
            follow_ups: citationsObj.follow_ups || [],
          };
        }
        return row;
      }) as QuestionRow[];
    },
  });

  const chunkMap = useMemo(() => new Map(chunks.map((c) => [c.chunk_index, c])), [chunks]);

  const overview = (doc?.overview ?? null) as DocumentOverview | null;

  const selaVersion: SelaVersion = useMemo(() => {
    if (!doc) return { summary: "", sections: [] };
    const ov = doc.overview as { sela_version?: SelaVersion } | null;
    if (ov?.sela_version?.sections && ov.sela_version.sections.length > 0) {
      return ov.sela_version;
    }
    const clausesList = Array.isArray(doc.clauses) ? (doc.clauses as ClauseFinding[]) : [];
    return {
      summary: overview?.summary || "Faithful structured breakdown.",
      sections: clausesList.map((c) => ({
        section_title: c.title,
        chunk_index: c.chunk_index,
        page_number: chunkMap.get(c.chunk_index)?.page_number || 1,
        what_it_says: c.what_it_says,
        why_it_matters: c.why_inspect,
        who_it_affects: undefined,
        what_happens: undefined,
        important_dates: undefined,
      })),
    };
  }, [doc, overview, chunkMap]);

  const showSource = async (chunkIndex: number, fallback?: Citation) => {
    evidenceTriggerRef.current = document.activeElement as HTMLElement | null;
    const chunk = chunkMap.get(chunkIndex);
    if (chunk?.content) {
      setOpenSource({ page: chunk.page_number, text: chunk.content });
      return;
    }
    if (fallback?.excerpt) {
      setOpenSource({ page: fallback.page, text: fallback.excerpt });
    }
    const { data, error } = await supabase
      .from("document_chunks")
      .select("chunk_index, page_number, content")
      .eq("document_id", activeDocumentId)
      .eq("chunk_index", chunkIndex)
      .maybeSingle();
    if (!error && data?.content) {
      setLoadedChunkMap((prev) => mergeChunkContent(prev, [data as Chunk]));
      setOpenSource({ page: data.page_number, text: data.content });
      return;
    }
    if (fallback) setOpenSource({ page: fallback.page, text: fallback.excerpt });
  };

  const SourceChip = ({ chunkIndex, label }: { chunkIndex: number; label?: string }) => {
    const chunk = chunkMap.get(chunkIndex);
    return (
      <button
        type="button"
        className="source-mark inline-flex items-center gap-1.5 rounded bg-muted/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => void showSource(chunkIndex)}
      >
        <Quote className="size-3 text-brass" />
        {label ?? `Source · page ${chunk?.page_number ?? "—"}`}
      </button>
    );
  };

  // Explain with SELA action
  const handleExplain = async (chunkIndex?: number, text?: string) => {
    evidenceTriggerRef.current = document.activeElement as HTMLElement | null;
    setExplaining(true);
    setOpenExplainDrawer(true);
    try {
      const result = await explainWithSela({
        data: {
          documentId: activeDocumentId,
          chunkIndex,
          text,
          language: selaLanguage,
        },
      });
      setExplainResult(result as SelaVersionSection);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not explain this passage.");
      setOpenExplainDrawer(false);
    } finally {
      setExplaining(false);
    }
  };

  // Language Change Handler for SELA'S VERSION
  const handleLanguageChange = async (newLang: "en" | "te" | "hi" | "ml" | "kn") => {
    setSelaLanguage(newLang);
    if (newLang === "en") {
      setTranslatedSections(null);
      return;
    }

    // 1. Check local in-memory cache
    if (languageCache[newLang] && languageCache[newLang].length > 0) {
      setTranslatedSections(languageCache[newLang]);
      return;
    }

    // 2. Check document overview cache from DB
    const overviewObj = (doc?.overview as Record<string, unknown> | null) || {};
    const dbTranslations =
      (overviewObj["translations"] as Record<string, SelaVersionSection[]> | undefined) || {};
    const cachedDbList = dbTranslations[newLang];
    if (cachedDbList && cachedDbList.length > 0) {
      setTranslatedSections(cachedDbList);
      setLanguageCache((prev) => ({ ...prev, [newLang]: cachedDbList }));
      return;
    }

    // 3. Obtain base sections from selaVersion
    const baseSections = selaVersion.sections || [];
    if (!baseSections.length) return;

    setTranslatingLanguage(true);
    try {
      const res = await translateSelaVersion({
        data: {
          documentId: activeDocumentId,
          targetLanguage: newLang,
          sections: baseSections,
        },
      });
      const translated = res.sections as SelaVersionSection[];
      setTranslatedSections(translated);
      setLanguageCache((prev) => ({ ...prev, [newLang]: translated }));
      toast.success(`SELA'S VERSION translated to ${LANGUAGE_LABELS[newLang]}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation could not be completed.");
      setSelaLanguage("en");
      setTranslatedSections(null);
    } finally {
      setTranslatingLanguage(false);
    }
  };

  // Ask SELA Submit
  const ask = async (
    overrideQuestion?: string,
    overrideMode?: "document" | "both" | "external",
  ) => {
    const qText = (overrideQuestion ?? question).trim();
    if (qText.length < 3) return;
    const mode = overrideMode ?? searchMode;
    setAsking(true);
    try {
      await askDocument({
        data: {
          documentId: activeDocumentId,
          question: qText,
          verifyExternal: mode === "both" || mode === "external" || verifyExternal,
          searchMode: mode,
        },
      });
      if (!overrideQuestion) setQuestion("");
      queryClient.invalidateQueries({ queryKey: ["questions", activeDocumentId] });
      toast.success("SELA answered your inquiry.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SELA could not answer that.");
    } finally {
      setAsking(false);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard.");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const runExpertMemoExport = async (opts: {
    documentTitle: string;
    fileName: string;
    pageCount?: number | null;
    overview: DocumentOverview | null;
    keyTerms: KeyTerm[];
    clauses: ClauseFinding[];
    issues: IssueFinding[];
    selaVersion: SelaVersion;
    questions: QuestionRow[];
  }) => {
    // Targeted fetches only — never silently reintroduce a full-corpus client cache.
    const needed = collectMemoChunkIndices({
      sections: opts.selaVersion.sections,
      clauses: opts.clauses,
      keyTerms: opts.keyTerms,
      issues: opts.issues,
      citations: opts.questions.flatMap((q) => q.citations ?? []),
    });
    const passageMap = new Map<number, Chunk>();
    for (const idx of needed) {
      const hit = loadedChunkMap.get(idx);
      if (hit?.content) passageMap.set(idx, hit);
    }
    const missing = needed.filter((idx) => !passageMap.has(idx));
    for (const batch of batchIndices(missing, 40)) {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("chunk_index, page_number, content")
        .eq("document_id", activeDocumentId)
        .in("chunk_index", batch)
        .order("chunk_index", { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      for (const row of data ?? []) {
        passageMap.set(row.chunk_index, row as Chunk);
      }
      setLoadedChunkMap((prev) => mergeChunkContent(prev, (data ?? []) as Chunk[]));
    }
    const passages = needed
      .map((idx) => passageMap.get(idx))
      .filter((c): c is Chunk => Boolean(c?.content));
    const { exportExpertMemoPdf } = await import("@/lib/expert-memo-pdf");
    exportExpertMemoPdf({
      ...opts,
      originalPassages: passages.map((c) => ({
        chunkIndex: c.chunk_index,
        page: c.page_number,
        content: c.content,
      })),
    });
  };

  if (!documentId || isLoading || !doc) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-muted-foreground">
          Loading this document…
        </div>
      </AppShell>
    );
  }

  const activeSections = translatedSections || selaVersion.sections || [];
  const keyTerms = (doc.key_terms ?? []) as KeyTerm[];
  const clauses = (doc.clauses ?? []) as ClauseFinding[];
  const issues = (doc.issues ?? []) as IssueFinding[];
  const sources = questions.flatMap((entry) =>
    (entry.citations ?? []).map((citation) => ({ ...citation, question: entry.question })),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Navigation Breadcrumb */}
        <Link
          to="/app/documents"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← All documents
        </Link>

        {/* Document Review Header */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="font-display text-4xl">{doc.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {doc.file_name}
              {doc.page_count ? ` · ${doc.page_count} pages` : ""}
            </p>
            <p className="mt-3 inline-flex items-center rounded-full border border-brass/40 bg-highlight px-3 py-1 text-xs font-medium text-foreground">
              {doc.status === "ready" ? "Ready for review" : (doc.status_detail ?? "Processing")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runExpertMemoExport({
                  documentTitle: doc.title,
                  fileName: doc.file_name,
                  pageCount: doc.page_count,
                  overview,
                  keyTerms,
                  clauses,
                  issues,
                  selaVersion,
                  questions,
                })
              }
              className="flex items-center gap-2 border-brass/50 text-foreground hover:bg-brass/10"
            >
              <Download className="size-4 text-brass" /> Export Expert Memo (PDF)
            </Button>
          </div>
        </div>

        {/* Main Tabbed Review Experience */}
        <Tabs
          defaultValue="sela-version"
          className="mt-8"
          onValueChange={(value) => setActiveTab(value)}
        >
          <TabsList className="flex-wrap bg-muted/60 p-1">
            <TabsTrigger value="sela-version" className="gap-1.5">
              <Sparkles className="size-3.5 text-brass" /> SELA'S VERSION
            </TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="original" className="gap-1.5">
              <BookOpen className="size-3.5" /> Original Document
            </TabsTrigger>
            <TabsTrigger value="ask" className="gap-1.5">
              <HelpCircle className="size-3.5" /> Ask SELA
            </TabsTrigger>
            <TabsTrigger value="terms">Key terms</TabsTrigger>
            <TabsTrigger value="clauses">Clauses</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="memo">Expert Memo</TabsTrigger>
          </TabsList>

          {/* TAB 1: SELA'S VERSION */}
          <TabsContent value="sela-version" className="mt-0">
            <DocumentVersionPanel
              selaLanguage={selaLanguage}
              translatingLanguage={translatingLanguage}
              handleLanguageChange={handleLanguageChange}
              sideBySide={sideBySide}
              setSideBySide={setSideBySide}
              activeSections={activeSections}
              chunks={chunks}
              fetchingFullChunks={fetchingFullChunks}
              handleExplain={handleExplain}
              showSource={(idx) => void showSource(idx)}
              passageListRef={passageListRef}
              onPassageScroll={onPassageScroll}
            />
          </TabsContent>

          {/* TAB 2: OVERVIEW */}
          <TabsContent value="overview" className="mt-7 space-y-6">
            {!overview && <Empty text="No overview was produced for this document." />}
            {overview && (
              <>
                <div className="paper-panel p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-brass">
                    {overview.document_type}
                  </p>
                  <p className="mt-3 font-display text-2xl leading-snug">{overview.purpose}</p>
                  <div className="rule-line my-5" />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {overview.summary}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="paper-panel p-6">
                    <h2 className="font-display text-xl">Who is in it</h2>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {overview.parties.length === 0 && (
                        <li>The document does not name parties.</li>
                      )}
                      {overview.parties.map((party) => (
                        <li key={party} className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-brass" /> {party}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="paper-panel p-6">
                    <h2 className="font-display text-xl">Dates that bind</h2>
                    <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                      {overview.dates.length === 0 && <li>No dates were stated.</li>}
                      {overview.dates.map((date) => (
                        <li key={`${date.label}-${date.chunk_index}`}>
                          <span className="text-foreground font-medium">{date.label}:</span>{" "}
                          {date.detail}
                          <div className="mt-1">
                            <SourceChip chunkIndex={date.chunk_index} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="paper-panel p-6">
                  <h2 className="font-display text-xl">What to look at first</h2>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {overview.what_matters_first.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </TabsContent>

          {/* TAB 3: ORIGINAL DOCUMENT ONLY — windowed content, meta always available */}
          <TabsContent value="original" className="mt-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Original document text</h2>
              <span className="text-xs text-muted-foreground">
                {chunkMeta.length || chunks.length} extracted passages
                {activeWindow ? ` · loaded ${activeWindow.start}–${activeWindow.end}` : ""}
              </span>
            </div>

            <div
              ref={passageListRef}
              className="max-h-[780px] space-y-3 overflow-y-auto pr-1"
              onScroll={onPassageScroll}
            >
              {fetchingFullChunks && chunks.every((c) => !c.content) && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Loading original passages…
                </p>
              )}
              {chunks.map((chunk) => (
                <div
                  key={chunk.chunk_index}
                  data-chunk-index={chunk.chunk_index}
                  className="paper-panel p-5"
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
                    <span className="font-medium text-brass">
                      Passage {chunk.chunk_index} · Page {chunk.page_number}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleExplain(chunk.chunk_index, chunk.content || undefined)}
                    >
                      <Sparkles className="size-3 text-brass" /> Explain with SELA
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                    {chunk.content || (fetchingFullChunks ? "Loading…" : "…")}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 4: ASK SELA */}
          <TabsContent value="ask" className="mt-0">
            <DocumentAskPanel
              question={question}
              setQuestion={setQuestion}
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              setVerifyExternal={setVerifyExternal}
              asking={asking}
              ask={(q, m) => void ask(q, m)}
              questions={questions}
              copiedId={copiedId}
              copyText={copyText}
              showSource={(idx, fb) => void showSource(idx, fb)}
            />
          </TabsContent>

          {/* TAB 5: KEY TERMS */}
          <TabsContent value="terms" className="mt-7 space-y-4">
            {keyTerms.length === 0 && <Empty text="No defined terms were found." />}
            {keyTerms.map((term) => (
              <div key={`${term.term}-${term.chunk_index}`} className="paper-panel p-6">
                <h3 className="font-display text-xl">{term.term}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {term.meaning_in_document}
                </p>
                <div className="mt-4">
                  <SourceChip chunkIndex={term.chunk_index} />
                </div>
              </div>
            ))}
          </TabsContent>

          {/* TAB 6: CLAUSES */}
          <TabsContent value="clauses" className="mt-7 space-y-4">
            {clauses.length === 0 && <Empty text="No clauses were identified." />}
            {clauses.map((clause) => (
              <div key={`${clause.title}-${clause.chunk_index}`} className="paper-panel p-6">
                <h3 className="font-display text-xl">{clause.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {clause.what_it_says}
                </p>
                <p className="mt-3 text-sm leading-relaxed">
                  <span className="text-brass font-medium">Worth inspecting: </span>
                  <span className="text-muted-foreground">{clause.why_inspect}</span>
                </p>
                <div className="mt-4">
                  <SourceChip chunkIndex={clause.chunk_index} />
                </div>
              </div>
            ))}
          </TabsContent>

          {/* TAB 7: ISSUES */}
          <TabsContent value="issues" className="mt-7 space-y-4">
            <p className="text-sm text-muted-foreground">
              Observations drawn from the text — descriptions of what is there, not ratings or
              verdicts.
            </p>
            {issues.length === 0 && <Empty text="No observations were recorded." />}
            {issues.map((issue) => (
              <div key={`${issue.title}-${issue.chunk_index}`} className="paper-panel p-6">
                <h3 className="font-display text-xl">{issue.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {issue.observation}
                </p>
                <div className="mt-4">
                  <SourceChip chunkIndex={issue.chunk_index} />
                </div>
              </div>
            ))}
          </TabsContent>

          {/* TAB 8: SOURCES */}
          <TabsContent value="sources" className="mt-7 space-y-4">
            {sources.length === 0 && (
              <Empty text="Cited passages appear here once you ask questions." />
            )}
            {sources.map((source, index) => (
              <div key={`${source.chunkIndex}-${index}`} className="paper-panel p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Page {source.page} · asked: {source.question}
                </p>
                <p className="mt-3 font-display text-lg leading-snug">“{source.excerpt}”</p>
                <div className="mt-4">
                  <SourceChip chunkIndex={source.chunkIndex} label="Open passage" />
                </div>
              </div>
            ))}
          </TabsContent>

          {/* TAB 9: EXPERT MEMO (Preview & Export PDF) */}
          <TabsContent value="memo" className="mt-7 space-y-6">
            <div className="paper-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brass">
                    SELA EXPERT MEMORANDUM
                  </p>
                  <h2 className="mt-1 font-display text-2xl">{doc.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    Comprehensive legal review memo with Original vs. SELA'S VERSION comparison
                  </p>
                </div>
                <Button
                  onClick={() =>
                    void runExpertMemoExport({
                      documentTitle: doc.title,
                      fileName: doc.file_name,
                      pageCount: doc.page_count,
                      overview,
                      keyTerms,
                      clauses,
                      issues,
                      selaVersion: {
                        summary: selaVersion.summary,
                        sections: activeSections,
                      },
                      questions,
                    })
                  }
                  className="gap-2"
                >
                  <Download className="size-4" /> Download PDF Memo
                </Button>
              </div>

              {/* Memo Structure Overview */}
              <div className="mt-6 space-y-6 text-sm">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    1. Executive Overview
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    {overview?.summary || "Summary prepared."}
                  </p>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    2. Original Document ↔ SELA'S VERSION Comparison
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The exported PDF includes structured side-by-side matrices matching each
                    original clause to SELA'S VERSION explanation.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-border bg-muted/20 p-3">
                      <p className="text-xs font-bold text-brass">ORIGINAL DOCUMENT TEXT</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Faithful verbatim excerpts with page citations.
                      </p>
                    </div>
                    <div className="rounded border border-border bg-muted/20 p-3">
                      <p className="text-xs font-bold text-brass">SELA'S VERSION</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Clear explanation of obligations, consequences, and timing.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    3. Evidence & Sources Included
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    All {clauses.length} clauses, {keyTerms.length} key terms, and{" "}
                    {questions.length} Q&A records are linked to passage chunk references.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <DocumentEvidenceSheet
        openSource={openSource}
        onOpenSourceChange={(open) => {
          if (!open) setOpenSource(null);
        }}
        openExplainDrawer={openExplainDrawer}
        onOpenExplainChange={setOpenExplainDrawer}
        explaining={explaining}
        explainResult={explainResult}
        focusReturnRef={evidenceTriggerRef}
      />
    </AppShell>
  );
}
