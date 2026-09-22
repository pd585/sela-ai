import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/sela/shell";

export const Route = createFileRoute("/_authenticated/about")({
  head: () => ({
    meta: [
      { title: "About SELA · SELA" },
      {
        name: "description",
        content: "Learn what SELA does and what it can and cannot do.",
      },
    ],
  }),
  component: AboutPage,
});

export function AboutPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/app/documents"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4"
        >
          <ArrowLeft className="size-4" /> Back to documents
        </Link>
        <p className="mt-10 text-xs uppercase tracking-[0.22em] text-brass">SELA</p>
        <h1 className="mt-3 font-display text-5xl">Legal document intelligence.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          SELA helps you understand legal documents, identify what deserves attention, ask grounded
          questions, and inspect the source passage behind an answer.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <section className="paper-panel p-6">
            <BookOpenCheck className="size-5 text-brass" />
            <h2 className="mt-4 font-display text-2xl">How it works</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Upload a PDF or Word document. SELA reads the text, organizes the important parts, and
              keeps answers connected to the document that supports them.
            </p>
          </section>
          <section className="paper-panel p-6">
            <ShieldCheck className="size-5 text-brass" />
            <h2 className="mt-4 font-display text-2xl">What it cannot do</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              SELA is a review aid, not a lawyer. It does not provide legal advice or make final
              legal determinations. For consequential decisions, speak with a qualified
              professional.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
