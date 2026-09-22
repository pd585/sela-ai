import { createFileRoute, Link, redirect, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { exportExpertMemoPdf } from "@/lib/expert-memo-pdf";
import { AppShell, Disclaimer } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  Check,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe,
  HelpCircle,
  Layers,
  Loader2,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

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

type Chunk = { chunk_index: number; page_number: number; content: string };
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

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  te: "తెలుగు (Telugu)",
  hi: "हिन्दी (Hindi)",
  ml: "മലയാളം (Malayalam)",
  kn: "ಕನ್ನಡ (Kannada)",
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

  // Side-by-side mode toggle for SELA'S VERSION tab
  const [sideBySide, setSideBySide] = useState(true);

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

  const { data: chunks = [] } = useQuery({
    queryKey: ["chunks", activeDocumentId],
    queryFn: async (): Promise<Chunk[]> => {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("chunk_index, page_number, content")
        .eq("document_id", activeDocumentId)
        .order("chunk_index", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

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

  const showSource = (chunkIndex: number, fallback?: Citation) => {
    const chunk = chunkMap.get(chunkIndex);
    if (chunk) setOpenSource({ page: chunk.page_number, text: chunk.content });
    else if (fallback) setOpenSource({ page: fallback.page, text: fallback.excerpt });
  };

  const SourceChip = ({ chunkIndex, label }: { chunkIndex: number; label?: string }) => {
    const chunk = chunkMap.get(chunkIndex);
    return (
      <button
        type="button"
        className="source-mark inline-flex items-center gap-1.5 rounded bg-muted/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => showSource(chunkIndex)}
      >
        <Quote className="size-3 text-brass" />
        {label ?? `Source · page ${chunk?.page_number ?? "—"}`}
      </button>
    );
  };

  // Explain with SELA action
  const handleExplain = async (chunkIndex?: number, text?: string) => {
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
                exportExpertMemoPdf({
                  documentTitle: doc.title,
                  fileName: doc.file_name,
                  pageCount: doc.page_count,
                  overview,
                  keyTerms,
                  clauses,
                  issues,
                  selaVersion,
                  questions,
                  originalPassages: chunks.map((c) => ({
                    chunkIndex: c.chunk_index,
                    page: c.page_number,
                    content: c.content,
                  })),
                })
              }
              className="flex items-center gap-2 border-brass/50 text-foreground hover:bg-brass/10"
            >
              <Download className="size-4 text-brass" /> Export Expert Memo (PDF)
            </Button>
          </div>
        </div>

        {/* Main Tabbed Review Experience */}
        <Tabs defaultValue="sela-version" className="mt-8">
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

          {/* TAB 1: SELA'S VERSION + ORIGINAL ↔ SELA'S VERSION SIDE-BY-SIDE */}
          <TabsContent value="sela-version" className="mt-7 space-y-6">
            {/* Top Bar: Language Selector & Notice */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Globe className="size-4 text-brass" />
                <Label
                  htmlFor="sela-lang"
                  className="text-xs font-semibold uppercase tracking-wider"
                >
                  Language
                </Label>
                <Select
                  value={selaLanguage}
                  onValueChange={(val) =>
                    handleLanguageChange(val as "en" | "te" | "hi" | "ml" | "kn")
                  }
                  disabled={translatingLanguage}
                >
                  <SelectTrigger id="sela-lang" className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {translatingLanguage && <Loader2 className="size-4 animate-spin text-brass" />}
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSideBySide(!sideBySide)}
                  className={`hidden items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium md:inline-flex ${
                    sideBySide
                      ? "bg-brass/20 text-brass-dark dark:text-brass"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns2 className="size-3.5" />
                  {sideBySide ? "Side-by-side view: ON" : "Side-by-side view: OFF"}
                </button>
              </div>
            </div>

            {/* Authoritative Text Notice */}
            <p className="text-xs italic text-muted-foreground">
              SELA'S VERSION is generated for understanding and review. The original document
              remains the authoritative text.
            </p>

            {/* Split View / Side-by-Side */}
            <div className={`grid gap-6 ${sideBySide ? "lg:grid-cols-2" : "grid-cols-1"}`}>
              {/* LEFT COLUMN: ORIGINAL DOCUMENT (when side-by-side active) */}
              {sideBySide && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h2 className="font-display text-lg">Original document</h2>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      Authoritative text
                    </span>
                  </div>

                  <div className="max-h-[750px] space-y-3 overflow-y-auto pr-2">
                    {chunks.map((chunk) => (
                      <div
                        key={chunk.chunk_index}
                        className="paper-panel relative border border-border/80 p-4 transition-colors hover:border-brass/40"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-brass">
                            Passage {chunk.chunk_index} · Page {chunk.page_number}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-brass hover:text-brass"
                            onClick={() => handleExplain(chunk.chunk_index, chunk.content)}
                          >
                            <Sparkles className="size-3" /> Explain with SELA
                          </Button>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RIGHT COLUMN: SELA'S VERSION (Structured breakdowns & visual intelligence) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="font-display text-lg">SELA'S VERSION</h2>
                  <span className="text-xs uppercase tracking-wider text-brass">
                    Faithful structured breakdown
                  </span>
                </div>

                <div className="max-h-[750px] space-y-4 overflow-y-auto pr-2">
                  {activeSections.length === 0 && (
                    <Empty text="SELA'S VERSION is being prepared for this document." />
                  )}

                  {activeSections.map((sec, idx) => (
                    <div key={`${sec.section_title}-${idx}`} className="paper-panel space-y-3 p-5">
                      <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2">
                        <h3 className="font-display text-xl leading-snug">{sec.section_title}</h3>
                        <button
                          type="button"
                          className="source-mark shrink-0 rounded bg-brass/10 px-2 py-0.5 text-xs text-brass hover:bg-brass/20"
                          onClick={() => showSource(sec.chunk_index)}
                        >
                          <Quote className="mr-1 inline size-3" />
                          Page {sec.page_number} · View source
                        </button>
                      </div>

                      {/* WHAT IT SAYS */}
                      <div>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-brass">
                          WHAT IT SAYS
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                          {sec.what_it_says}
                        </p>
                      </div>

                      {/* WHY IT MATTERS */}
                      {sec.why_it_matters && (
                        <div>
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            WHY IT MATTERS
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {sec.why_it_matters}
                          </p>
                        </div>
                      )}

                      {/* WHO IT AFFECTS & WHAT HAPPENS */}
                      {(sec.who_it_affects || sec.what_happens) && (
                        <div className="grid gap-3 pt-1 sm:grid-cols-2">
                          {sec.who_it_affects && (
                            <div className="rounded bg-muted/40 p-2.5 text-xs">
                              <span className="font-semibold text-foreground">
                                WHO IT AFFECTS:{" "}
                              </span>
                              <span className="text-muted-foreground">{sec.who_it_affects}</span>
                            </div>
                          )}
                          {sec.what_happens && (
                            <div className="rounded bg-muted/40 p-2.5 text-xs">
                              <span className="font-semibold text-foreground">WHAT HAPPENS: </span>
                              <span className="text-muted-foreground">{sec.what_happens}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* IMPORTANT DATES */}
                      {sec.important_dates && (
                        <div className="rounded border border-border/80 bg-background/50 p-2 text-xs">
                          <span className="font-semibold text-brass">IMPORTANT DATES: </span>
                          <span className="text-foreground">{sec.important_dates}</span>
                        </div>
                      )}

                      {/* GROUNDED VISUAL INTELLIGENCE */}
                      {sec.visual && <VisualDiagramCard visual={sec.visual} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
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

          {/* TAB 3: ORIGINAL DOCUMENT ONLY */}
          <TabsContent value="original" className="mt-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Original document text</h2>
              <span className="text-xs text-muted-foreground">
                {chunks.length} extracted passages
              </span>
            </div>

            <div className="space-y-3">
              {chunks.map((chunk) => (
                <div key={chunk.chunk_index} className="paper-panel p-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
                    <span className="font-medium text-brass">
                      Passage {chunk.chunk_index} · Page {chunk.page_number}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleExplain(chunk.chunk_index, chunk.content)}
                    >
                      <Sparkles className="size-3 text-brass" /> Explain with SELA
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 4: ASK SELA (Grounded RAG + External Verification + Follow-ups) */}
          <TabsContent value="ask" className="mt-7 space-y-6">
            <div className="paper-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="font-display text-xl">Ask SELA</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ask questions grounded strictly in your document, or search external public
                    legal sources.
                  </p>
                </div>
                {/* Research Scope Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                    SCOPE:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode("document");
                      setVerifyExternal(false);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      searchMode === "document"
                        ? "bg-brass text-white shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ✓ Document only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode("both");
                      setVerifyExternal(true);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      searchMode === "both"
                        ? "bg-brass text-white shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🌐 Document + External Sources
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode("external");
                      setVerifyExternal(true);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      searchMode === "external"
                        ? "bg-brass text-white shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🏛️ External Sources Only
                  </button>
                </div>
              </div>

              <Textarea
                className="mt-4"
                rows={3}
                placeholder={
                  searchMode === "external"
                    ? "Ask a general legal or statutory question (e.g. What is the statutory notice period for IT employment in India?)"
                    : searchMode === "both"
                      ? "Ask a question comparing this document with legal statutes (e.g. Does current employment law require anything beyond this notice clause?)"
                      : "Ask about this document (e.g. Can the employer terminate this agreement immediately without notice?)"
                }
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {searchMode === "document"
                      ? "Searching uploaded document passages only."
                      : searchMode === "both"
                        ? "Checking document evidence + live authoritative public web sources."
                        : "Researching authoritative public legal statutes & official gazettes."}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Disclaimer className="hidden max-w-sm lg:block" />
                  <Button
                    onClick={() => void ask()}
                    disabled={asking || question.trim().length < 3}
                  >
                    {asking ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Analyzing
                      </>
                    ) : (
                      "Ask SELA"
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Q&A Inquiries Stream */}
            {questions.length === 0 && <Empty text="No questions asked yet." />}
            {questions.map((entry) => {
              const hasDocLayer =
                (entry.citations && entry.citations.length > 0) ||
                (entry.answer && !entry.external_verification);
              const hasExtLayer = Boolean(
                entry.external_verification && entry.external_verification.status !== "UNAVAILABLE",
              );

              return (
                <div key={entry.id} className="paper-panel space-y-4 p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-display text-xl">{entry.question}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => copyText(entry.answer, entry.id)}
                      title="Copy answer"
                    >
                      {copiedId === entry.id ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>

                  <div className="rule-line" />

                  {/* LAYER 1: FROM YOUR DOCUMENT */}
                  {hasDocLayer && (
                    <div className="rounded-md border border-border/80 bg-background/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-brass">
                          LAYER 1 · FROM YOUR DOCUMENT
                        </p>
                        <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wider font-semibold">
                          Authoritative Text Evidence
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90">{entry.answer}</p>

                      {entry.sufficient === false && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                          <span>SELA could not fully support this from the document alone.</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold text-brass hover:underline"
                            onClick={() => void ask(entry.question, "external")}
                          >
                            <ExternalLink className="size-3" /> Search external legal sources for
                            this
                          </button>
                        </div>
                      )}

                      {entry.citations && entry.citations.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {entry.citations.map((citation) => (
                            <button
                              key={`${entry.id}-${citation.chunkIndex}`}
                              type="button"
                              className="source-mark"
                              onClick={() => showSource(citation.chunkIndex, citation)}
                            >
                              <Quote className="size-3 text-brass" /> Source · page {citation.page}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LAYER 2: FROM EXTERNAL SOURCES */}
                  {hasExtLayer && entry.external_verification && (
                    <div className="rounded-md border border-brass/30 bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-brass">
                          LAYER 2 · FROM EXTERNAL SOURCES
                        </p>
                        <span
                          className={`rounded px-2 py-0.5 text-[0.65rem] font-bold uppercase ${
                            entry.external_verification.status === "CONSISTENT"
                              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                              : entry.external_verification.status === "DIFFERS"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          {entry.external_verification.status}
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed text-foreground/90">
                        {entry.external_verification.summary}
                      </p>

                      {/* HOW THEY RELATE (When both layers exist) */}
                      {entry.external_verification.how_they_relate && (
                        <div className="rounded bg-background/60 p-2.5 text-xs border border-border/60">
                          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                            HOW THEY RELATE · COMPARISON
                          </p>
                          <p className="mt-1 text-muted-foreground leading-relaxed">
                            {entry.external_verification.how_they_relate}
                          </p>
                        </div>
                      )}

                      {/* Clickable External Sources */}
                      {entry.external_verification.sources &&
                        entry.external_verification.sources.length > 0 && (
                          <div className="pt-1">
                            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                              Retrieved Public Sources:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {entry.external_verification.sources.map((s, idx) => (
                                <a
                                  key={idx}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-background px-2.5 py-1 text-[0.7rem] text-foreground underline hover:text-brass transition-colors shadow-sm"
                                >
                                  <ExternalLink className="size-3 text-brass" /> {s.title}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* External Check Unavailable state */}
                  {entry.external_verification?.status === "UNAVAILABLE" && (
                    <div className="rounded bg-muted/40 p-2.5 text-xs text-muted-foreground italic">
                      SELA couldn't complete the external source check right now.
                    </div>
                  )}

                  {/* USEFUL GROUNDED FOLLOW-UP QUESTIONS */}
                  {entry.follow_ups && entry.follow_ups.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Grounded follow-up questions:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.follow_ups.map((fu, fIdx) => (
                          <button
                            key={fIdx}
                            type="button"
                            className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:border-brass/50 hover:bg-brass/5"
                            onClick={() => void ask(fu)}
                          >
                            {fu} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                    exportExpertMemoPdf({
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
                      originalPassages: chunks.map((c) => ({
                        chunkIndex: c.chunk_index,
                        page: c.page_number,
                        content: c.content,
                      })),
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

      {/* SOURCE DRAWER (Sheet) */}
      <Sheet open={Boolean(openSource)} onOpenChange={(open) => !open && setOpenSource(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">
              Source passage · Page {openSource?.page}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8 pt-4">
            <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
              {openSource?.text}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* EXPLAIN WITH SELA DRAWER */}
      <Sheet open={openExplainDrawer} onOpenChange={setOpenExplainDrawer}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Explain with SELA</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8 pt-4 space-y-4">
            {explaining && (
              <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground justify-center">
                <Loader2 className="size-5 animate-spin text-brass" /> SELA is generating a grounded
                explanation…
              </div>
            )}

            {!explaining && explainResult && (
              <div className="space-y-4 text-sm">
                <div className="border-b border-border pb-2">
                  <h3 className="font-display text-xl">{explainResult.section_title}</h3>
                  <p className="text-xs text-brass">
                    Page {explainResult.page_number} · Passage {explainResult.chunk_index}
                  </p>
                </div>

                <div>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wider text-brass">
                    WHAT IT SAYS
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">{explainResult.what_it_says}</p>
                </div>

                {explainResult.why_it_matters && (
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                      WHY IT MATTERS
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {explainResult.why_it_matters}
                    </p>
                  </div>
                )}

                {explainResult.who_it_affects && (
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                      WHO IT AFFECTS
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {explainResult.who_it_affects}
                    </p>
                  </div>
                )}

                {explainResult.what_happens && (
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">
                      WHAT HAPPENS
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {explainResult.what_happens}
                    </p>
                  </div>
                )}

                {explainResult.visual && <VisualDiagramCard visual={explainResult.visual} />}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

// ----------------------------------------------------
// Visual Diagram Renderer Component
// ----------------------------------------------------
function VisualDiagramCard({ visual }: { visual: VisualIntelligence }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/60 p-3.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brass">
        <Layers className="size-3.5" />
        <span className="uppercase tracking-wider">Visual: {visual.title}</span>
      </div>

      <div className="mt-2 space-y-2">
        {visual.items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brass/20 text-[0.65rem] font-bold text-brass">
              {item.step ?? idx + 1}
            </span>
            <div>
              <span className="font-semibold text-foreground">{item.label}</span>
              {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="paper-panel p-6 text-sm text-muted-foreground">{text}</p>;
}
