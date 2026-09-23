import { Columns2, Globe, Loader2, Quote, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelaVersionSection } from "@/lib/sela.functions";
import { Empty, LANGUAGE_LABELS, VisualDiagramCard } from "./document-shared";

type Chunk = { chunk_index: number; page_number: number; content: string };

type Props = {
  selaLanguage: "en" | "te" | "hi" | "ml" | "kn";
  translatingLanguage: boolean;
  handleLanguageChange: (lang: "en" | "te" | "hi" | "ml" | "kn") => void;
  sideBySide: boolean;
  setSideBySide: (v: boolean) => void;
  activeSections: SelaVersionSection[];
  chunks: Chunk[];
  fetchingFullChunks: boolean;
  handleExplain: (chunkIndex?: number, text?: string) => void;
  showSource: (chunkIndex: number) => void;
};

export function DocumentVersionPanel({
  selaLanguage,
  translatingLanguage,
  handleLanguageChange,
  sideBySide,
  setSideBySide,
  activeSections,
  chunks,
  fetchingFullChunks,
  handleExplain,
  showSource,
}: Props) {
  return (
    <div className="mt-7 space-y-6">
      {/* Top Bar: Language Selector & Notice */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Globe className="size-4 text-brass" />
          <Label htmlFor="sela-lang" className="text-xs font-semibold uppercase tracking-wider">
            Language
          </Label>
          <Select
            value={selaLanguage}
            onValueChange={(val) => handleLanguageChange(val as "en" | "te" | "hi" | "ml" | "kn")}
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
        SELA'S VERSION is generated for understanding and review. The original document remains the
        authoritative text.
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
              {fetchingFullChunks && chunks.every((c) => !c.content) && (
                <p className="text-xs text-muted-foreground">Loading original passages…</p>
              )}
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
                      onClick={() => handleExplain(chunk.chunk_index, chunk.content || undefined)}
                    >
                      <Sparkles className="size-3" /> Explain with SELA
                    </Button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                    {chunk.content || "…"}
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
                    onClick={() => void showSource(sec.chunk_index)}
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
                        <span className="font-semibold text-foreground">WHO IT AFFECTS: </span>
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
    </div>
  );
}
