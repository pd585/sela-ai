import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { askDocument, type Citation } from "@/lib/sela.functions";
import { AppShell, Disclaimer } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Check, Copy, ExternalLink, Loader2, Quote } from "lucide-react";
import { toast } from "sonner";

type DocumentOption = { id: string; title: string; file_name: string };
type SearchMode = "document" | "both" | "external";
type Answer = {
  question: string;
  answer: string;
  sufficient: boolean | null;
  citations: Citation[] | null;
  follow_ups?: string[];
  external_verification?: {
    status: string;
    summary: string;
    sources?: Array<{ title: string; url: string; published_date?: string }>;
  } | null;
  mode: SearchMode;
};

function titleFor(title: string, fileName: string) {
  const source = /^[a-f0-9]{24,}$/i.test(title) ? fileName.replace(/\.(pdf|docx)$/i, "") : title;
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AskSelaPage() {
  const [selectedId, setSelectedId] = useState("");
  const [question, setQuestion] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("document");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [source, setSource] = useState<{ page: number; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["ask-documents"],
    queryFn: async (): Promise<DocumentOption[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_name")
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const activeId = selectedId || documents[0]?.id || "";

  const submit = async (overrideQuestion?: string) => {
    const text = (overrideQuestion ?? question).trim();
    if (!activeId || text.length < 3) return;
    setAsking(true);
    try {
      const res = await askDocument({
        data: {
          documentId: activeId,
          question: text,
          searchMode,
        },
      });
      setAnswer(res as Answer);
      if (!overrideQuestion) setQuestion("");
      toast.success("SELA answered your question.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SELA could not answer that.");
    } finally {
      setAsking(false);
    }
  };

  const copyAnswer = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer.answer);
    setCopied(true);
    toast.success("Answer copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Review</p>
        <h1 className="mt-2 font-display text-5xl">Ask SELA</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Ask a question about one of your documents. SELA answers strictly from the document with
          verified sources and can optionally cross-check with public external law.
        </p>

        <section className="paper-panel mt-10 p-6 space-y-4">
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              htmlFor="ask-document"
            >
              Select Document
            </label>
            <Select
              value={activeId}
              onValueChange={setSelectedId}
              disabled={isLoading || !documents.length}
            >
              <SelectTrigger id="ask-document" className="mt-2 max-w-xl">
                <SelectValue
                  placeholder={isLoading ? "Loading documents..." : "Select a document"}
                />
              </SelectTrigger>
              <SelectContent>
                {documents.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {titleFor(document.title, document.file_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && !documents.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                A ready document is needed before you can ask a question.
              </p>
            )}
          </div>

          <div className="mt-4">
            <Label htmlFor="ask-question" className="sr-only">
              Your question
            </Label>
            <Textarea
              id="ask-question"
              rows={4}
              placeholder="What do you want to understand? e.g. What is the penalty for early termination?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={!activeId}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-56">
              <Label htmlFor="ask-research-scope" className="text-xs font-medium">
                Research scope
              </Label>
              <Select
                value={searchMode}
                onValueChange={(value) => {
                  if (value === "document" || value === "both" || value === "external") {
                    setSearchMode(value);
                  }
                }}
              >
                <SelectTrigger
                  id="ask-research-scope"
                  className="mt-2"
                  aria-describedby="ask-page-scope-description"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">This document only</SelectItem>
                  <SelectItem value="both">Document + external sources</SelectItem>
                  <SelectItem value="external">External sources only</SelectItem>
                </SelectContent>
              </Select>
              <p
                id="ask-page-scope-description"
                className="mt-2 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {searchMode === "document"
                  ? "Answers use only passages from the selected document."
                  : searchMode === "both"
                    ? "Answers combine document passages with public external legal sources."
                    : "Answers use public external legal sources only (not this document’s text)."}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Disclaimer className="hidden max-w-xs sm:block" />
              <Button
                onClick={() => void submit()}
                disabled={asking || !activeId || question.trim().length < 3}
              >
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
        </section>

        {answer && (
          <section className="paper-panel mt-6 space-y-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-brass">Inquiry</p>
                <h2 className="mt-1 font-display text-2xl">{answer.question}</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={copyAnswer}
                title="Copy answer"
              >
                {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
              </Button>
            </div>

            {/* LAYER 1: FROM YOUR DOCUMENT */}
            <div className="rounded-md border border-border/80 bg-background/50 p-4">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-brass">
                {answer.mode === "external"
                  ? "EXTERNAL SOURCE RESEARCH"
                  : "LAYER 1 · FROM YOUR DOCUMENT"}
              </p>
              <p className="mt-2 text-base leading-relaxed text-foreground/90">{answer.answer}</p>
              {answer.sufficient === false && (
                <p className="mt-3 text-xs text-brass">
                  SELA could not fully support this from the document alone.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {(answer.citations ?? []).map((citation) => (
                  <button
                    key={`${citation.chunkIndex}-${citation.page}`}
                    type="button"
                    className="source-mark"
                    onClick={() => {
                      setSource({ page: citation.page, text: citation.excerpt });
                    }}
                  >
                    <Quote className="size-3 text-brass" /> View source · page {citation.page}
                  </button>
                ))}
              </div>
            </div>

            {/* LAYER 2: EXTERNAL VERIFICATION (if performed) */}
            {answer.mode !== "external" &&
              answer.external_verification &&
              answer.external_verification.status !== "UNAVAILABLE" && (
                <div className="rounded-md border border-brass/30 bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-brass">
                      LAYER 2 · EXTERNAL VERIFICATION
                    </p>
                    <span
                      className={`rounded px-2 py-0.5 text-[0.65rem] font-bold uppercase ${
                        answer.external_verification.status === "CONSISTENT"
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : answer.external_verification.status === "DIFFERS"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {answer.external_verification.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {answer.external_verification.summary}
                  </p>
                  {answer.external_verification.sources &&
                    answer.external_verification.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {answer.external_verification.sources.map((s, idx) => (
                          <a
                            key={idx}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 text-[0.7rem] text-foreground underline hover:text-brass"
                          >
                            <ExternalLink className="size-3" /> {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                </div>
              )}

            {/* USEFUL GROUNDED FOLLOW-UP QUESTIONS */}
            {answer.follow_ups && answer.follow_ups.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Grounded follow-up questions:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {answer.follow_ups.map((fu, fIdx) => (
                    <button
                      key={fIdx}
                      type="button"
                      className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:border-brass/50 hover:bg-brass/5"
                      onClick={() => void submit(fu)}
                    >
                      {fu} →
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <Sheet open={Boolean(source)} onOpenChange={(open) => !open && setSource(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Source · page {source?.page}</SheetTitle>
          </SheetHeader>
          <p className="whitespace-pre-wrap px-4 pb-8 pt-4 font-mono text-xs leading-relaxed text-foreground/90">
            {source?.text}
          </p>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
