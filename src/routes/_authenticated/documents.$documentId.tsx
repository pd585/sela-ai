import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { askDocument } from "@/lib/sela.functions";
import type {
  ClauseFinding,
  DocumentOverview,
  IssueFinding,
  KeyTerm,
  Citation,
} from "@/lib/sela.functions";
import { AppShell, Disclaimer } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Quote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Document review · SELA" },
      {
        name: "description",
        content:
          "Read the overview, key terms, clauses and observations for your document, and ask questions answered from the text itself.",
      },
      { property: "og:title", content: "Document review · SELA" },
      {
        property: "og:description",
        content:
          "Read the overview, key terms, clauses and observations for your document, and ask questions answered from the text itself.",
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
  created_at: string;
};

function DocumentReview() {
  const { documentId } = Route.useParams();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [openSource, setOpenSource] = useState<{ page: number; text: string } | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_name, page_count, status, overview, key_terms, clauses, issues")
        .eq("id", documentId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: chunks = [] } = useQuery({
    queryKey: ["chunks", documentId],
    queryFn: async (): Promise<Chunk[]> => {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("chunk_index, page_number, content")
        .eq("document_id", documentId)
        .order("chunk_index", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["questions", documentId],
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data, error } = await supabase
        .from("document_questions")
        .select("id, question, answer, citations, sufficient, created_at")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as QuestionRow[];
    },
  });

  const chunkMap = useMemo(() => new Map(chunks.map((c) => [c.chunk_index, c])), [chunks]);

  const showSource = (chunkIndex: number, fallback?: Citation) => {
    const chunk = chunkMap.get(chunkIndex);
    if (chunk) setOpenSource({ page: chunk.page_number, text: chunk.content });
    else if (fallback) setOpenSource({ page: fallback.page, text: fallback.excerpt });
  };

  const SourceChip = ({ chunkIndex, label }: { chunkIndex: number; label?: string }) => {
    const chunk = chunkMap.get(chunkIndex);
    return (
      <button type="button" className="source-mark" onClick={() => showSource(chunkIndex)}>
        <Quote className="size-3" />
        {label ?? `Source · page ${chunk?.page_number ?? "—"}`}
      </button>
    );
  };

  const ask = async () => {
    const trimmed = question.trim();
    if (trimmed.length < 3) return;
    setAsking(true);
    try {
      await askDocument({ data: { documentId, question: trimmed } });
      setQuestion("");
      queryClient.invalidateQueries({ queryKey: ["questions", documentId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SELA could not answer that.");
    } finally {
      setAsking(false);
    }
  };

  if (isLoading || !doc) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-muted-foreground">
          Loading this document…
        </div>
      </AppShell>
    );
  }

  const overview = doc.overview as DocumentOverview | null;
  const keyTerms = (doc.key_terms ?? []) as KeyTerm[];
  const clauses = (doc.clauses ?? []) as ClauseFinding[];
  const issues = (doc.issues ?? []) as IssueFinding[];
  const sources = questions.flatMap((entry) =>
    (entry.citations ?? []).map((citation) => ({ ...citation, question: entry.question })),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/workspace"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← All documents
        </Link>
        <h1 className="mt-4 font-display text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.file_name}
          {doc.page_count ? ` · ${doc.page_count} pages` : ""}
        </p>

        <Tabs defaultValue="overview" className="mt-9">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ask">Ask SELA</TabsTrigger>
            <TabsTrigger value="terms">Key terms</TabsTrigger>
            <TabsTrigger value="clauses">Clauses</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>

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
                        <li key={party}>{party}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="paper-panel p-6">
                    <h2 className="font-display text-xl">Dates that bind</h2>
                    <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                      {overview.dates.length === 0 && <li>No dates were stated.</li>}
                      {overview.dates.map((date) => (
                        <li key={`${date.label}-${date.chunk_index}`}>
                          <span className="text-foreground">{date.label}:</span> {date.detail}
                          <div className="mt-2">
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

          <TabsContent value="ask" className="mt-7 space-y-6">
            <div className="paper-panel p-6">
              <h2 className="font-display text-xl">Ask about this document</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                SELA answers only from the text of this document and shows the passages it used.
              </p>
              <Textarea
                className="mt-4"
                rows={3}
                placeholder="e.g. What happens if I want to end this early?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <div className="mt-3 flex items-center justify-between gap-4">
                <Disclaimer className="max-w-md" />
                <Button onClick={() => void ask()} disabled={asking || question.trim().length < 3}>
                  {asking ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Reading
                    </>
                  ) : (
                    "Ask SELA"
                  )}
                </Button>
              </div>
            </div>

            {questions.length === 0 && <Empty text="No questions asked yet." />}
            {questions.map((entry) => (
              <div key={entry.id} className="paper-panel p-6">
                <p className="font-display text-xl">{entry.question}</p>
                <div className="rule-line my-4" />
                <p className="text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
                {entry.sufficient === false && (
                  <p className="mt-3 text-xs text-brass">
                    SELA could not fully support this from the document.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(entry.citations ?? []).map((citation) => (
                    <button
                      key={`${entry.id}-${citation.chunkIndex}`}
                      type="button"
                      className="source-mark"
                      onClick={() => showSource(citation.chunkIndex, citation)}
                    >
                      <Quote className="size-3" /> Source · page {citation.page}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

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

          <TabsContent value="clauses" className="mt-7 space-y-4">
            {clauses.length === 0 && <Empty text="No clauses were identified." />}
            {clauses.map((clause) => (
              <div key={`${clause.title}-${clause.chunk_index}`} className="paper-panel p-6">
                <h3 className="font-display text-xl">{clause.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {clause.what_it_says}
                </p>
                <p className="mt-3 text-sm leading-relaxed">
                  <span className="text-brass">Worth inspecting: </span>
                  <span className="text-muted-foreground">{clause.why_inspect}</span>
                </p>
                <div className="mt-4">
                  <SourceChip chunkIndex={clause.chunk_index} />
                </div>
              </div>
            ))}
          </TabsContent>

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

          <TabsContent value="sources" className="mt-7 space-y-4">
            {sources.length === 0 && (
              <Empty text="Cited passages appear here once you ask a question." />
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
        </Tabs>
      </div>

      <Sheet open={Boolean(openSource)} onOpenChange={(open) => !open && setOpenSource(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">
              Passage · page {openSource?.page}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {openSource?.text}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="paper-panel p-6 text-sm text-muted-foreground">{text}</p>;
}
