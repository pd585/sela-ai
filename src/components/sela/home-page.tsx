import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  FileText,
  MessageSquareText,
  Plus,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";

type RecentDoc = {
  id: string;
  title: string;
  file_name: string;
  page_count: number | null;
  status: string;
  created_at: string;
};

const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Upload",
    body: "Add a PDF or Word document to your private workspace.",
    icon: FileText,
  },
  {
    number: "02",
    title: "SELA reads it",
    body: "The document becomes a source-linked review briefing with dates and clauses.",
    icon: ScanSearch,
  },
  {
    number: "03",
    title: "Ask & review with sources",
    body: "Inspect findings and ask questions answered directly from the text.",
    icon: MessageSquareText,
  },
];

function titleFor(title: string, fileName: string) {
  const looksLikeId = /^[a-f0-9]{24,}$/i.test(title);
  const source = looksLikeId ? fileName.replace(/\.(pdf|docx)$/i, "") : title;
  return source
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function HomePage() {
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["home-recent-documents"],
    queryFn: async (): Promise<RecentDoc[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_name, page_count, status, created_at")
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* SELA Header & Welcome */}
        <section className="border-b border-border pb-12">
          <p className="text-xs uppercase tracking-[0.22em] text-brass">SELA</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight">
            Legal document intelligence for the work in front of you.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            SELA helps you understand legal documents, identify what matters, ask questions grounded
            in the text, and inspect the exact source behind every answer.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/app/documents">
              <Button className="gap-2">
                <Plus className="size-4" /> Upload a document
              </Button>
            </Link>
            <Link to="/app/ask-sela">
              <Button variant="outline" className="gap-2">
                <MessageSquareText className="size-4 text-brass" /> Ask SELA
              </Button>
            </Link>
            <Link to="/app/documents">
              <Button variant="ghost" className="gap-2">
                All documents <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Your Legal Desk / Continue where you left off */}
        <section className="border-b border-border py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brass">Your legal desk</p>
              <h2 className="mt-2 font-display text-3xl">Continue where you left off</h2>
            </div>
            {documents.length > 0 && (
              <Link
                to="/app/documents"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                View all documents →
              </Link>
            )}
          </div>

          <div className="mt-8 space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading your desk…</p>}

            {!isLoading && documents.length === 0 && (
              <div className="paper-panel p-8 text-center">
                <FileText className="mx-auto size-6 text-brass" />
                <h3 className="mt-4 font-display text-xl">Your desk is ready</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Upload a contract, lease, agreement, or policy to begin a source-grounded review.
                </p>
                <div className="mt-6">
                  <Link to="/app/documents">
                    <Button size="sm" className="gap-2">
                      <Plus className="size-4" /> Upload your first document
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {documents.map((doc) => {
              const ready = doc.status === "ready";
              const title = titleFor(doc.title, doc.file_name);
              const cardContent = (
                <div className="paper-panel flex flex-wrap items-center justify-between gap-4 p-5 transition-shadow hover:shadow-lift">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doc.file_name}
                      {doc.page_count ? ` · ${doc.page_count} pages` : ""} ·{" "}
                      {ready
                        ? "Ready for review"
                        : doc.status === "failed"
                          ? "Unable to process"
                          : "Processing"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ready ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brass">
                        Open review <ArrowRight className="size-3.5" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">In progress</span>
                    )}
                  </div>
                </div>
              );

              return ready ? (
                <Link
                  key={doc.id}
                  to="/app/documents/$documentId/review"
                  params={{ documentId: doc.id }}
                  className="block"
                >
                  {cardContent}
                </Link>
              ) : (
                <Link key={doc.id} to="/app/documents" className="block">
                  {cardContent}
                </Link>
              );
            })}
          </div>
        </section>

        {/* How SELA Works */}
        <section className="border-b border-border py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brass">How it works</p>
              <h2 className="mt-2 font-display text-3xl">From document to understanding.</h2>
            </div>
            <ShieldCheck className="hidden size-7 text-brass sm:block" />
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step) => {
              const StepIcon = step.icon;
              return (
                <div key={step.number} className="paper-panel p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs tracking-[0.18em] text-brass">{step.number}</span>
                    <StepIcon className="size-5 text-brass" />
                  </div>
                  <h3 className="mt-7 font-display text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trust & Precision Callout */}
        <section className="grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brass">
              A trustworthy review starts here
            </p>
            <h2 className="mt-3 font-display text-3xl">Keep the original close.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Every meaningful answer stays grounded in your document. When SELA cannot support an
              answer from the text, it says so explicitly.
            </p>
          </div>
          <Link to="/app/documents">
            <Button variant="outline" className="gap-2">
              <Sparkles className="size-4 text-brass" /> View your documents
            </Button>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
