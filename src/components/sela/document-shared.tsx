import { Layers } from "lucide-react";
import type { VisualIntelligence } from "@/lib/sela.functions";

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  te: "తెలుగు (Telugu)",
  hi: "हिन्दी (Hindi)",
  ml: "മലയാളം (Malayalam)",
  kn: "ಕನ್ನಡ (Kannada)",
};

export function VisualDiagramCard({ visual }: { visual: VisualIntelligence }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/60 p-3.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brass">
        <Layers className="size-3.5" />
        <span className="uppercase tracking-wider">Visual: {visual.title}</span>
      </div>

      <div className="mt-2 space-y-2">
        {(visual.items ?? []).map((item, idx) => (
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

export function Empty({ text }: { text: string }) {
  return <p className="paper-panel p-6 text-sm text-muted-foreground">{text}</p>;
}
