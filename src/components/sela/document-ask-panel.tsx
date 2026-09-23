import { Check, Copy, ExternalLink, Loader2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Disclaimer } from "@/components/sela/shell";
import type { Citation } from "@/lib/sela.functions";
import { Empty } from "./document-shared";

export type AskQuestionRow = {
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
};

type Props = {
  question: string;
  setQuestion: (v: string) => void;
  searchMode: "document" | "both" | "external";
  setSearchMode: (m: "document" | "both" | "external") => void;
  setVerifyExternal: (v: boolean) => void;
  asking: boolean;
  ask: (overrideQuestion?: string, overrideMode?: "document" | "both" | "external") => void;
  questions: AskQuestionRow[];
  copiedId: string | null;
  copyText: (text: string, id: string) => void;
  showSource: (chunkIndex: number, fallback?: Citation) => void;
};

export function DocumentAskPanel({
  question,
  setQuestion,
  searchMode,
  setSearchMode,
  setVerifyExternal,
  asking,
  ask,
  questions,
  copiedId,
  copyText,
  showSource,
}: Props) {
  return (
    <div className="mt-7 space-y-6">
      <div className="paper-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="font-display text-xl">Ask SELA</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask questions grounded strictly in your document, or search external public legal
              sources.
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
          id="sela-ask-question"
          aria-label="Ask SELA a question"
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
            <Button onClick={() => void ask()} disabled={asking || question.trim().length < 3}>
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
                      <ExternalLink className="size-3" /> Search external legal sources for this
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
                        onClick={() => void showSource(citation.chunkIndex, citation)}
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
    </div>
  );
}
