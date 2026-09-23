import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SelaVersionSection } from "@/lib/sela.functions";
import { VisualDiagramCard } from "./document-shared";

type Props = {
  openSource: { page: number; text: string } | null;
  onOpenSourceChange: (open: boolean) => void;
  openExplainDrawer: boolean;
  onOpenExplainChange: (open: boolean) => void;
  explaining: boolean;
  explainResult: SelaVersionSection | null;
};

export function DocumentEvidenceSheet({
  openSource,
  onOpenSourceChange,
  openExplainDrawer,
  onOpenExplainChange,
  explaining,
  explainResult,
}: Props) {
  return (
    <>
      <Sheet open={Boolean(openSource)} onOpenChange={(open) => !open && onOpenSourceChange(false)}>
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

      <Sheet open={openExplainDrawer} onOpenChange={onOpenExplainChange}>
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
    </>
  );
}
