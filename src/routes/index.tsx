import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Quote, ScanSearch, ShieldQuestion } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SELA — Understand what your legal document actually says" },
      {
        name: "description",
        content:
          "SELA turns a contract or legal document into a structured review session: a source-grounded overview, the clauses worth inspecting, and answers you can trace back to the exact passage.",
      },
      { property: "og:title", content: "SELA — Understand what your legal document actually says" },
      {
        property: "og:description",
        content:
          "Upload a contract, see what matters, ask questions, and trace every answer back to the source text.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const promises = [
  {
    ask: "Tell me what this document is.",
    gives: "A clear overview grounded in the document itself.",
  },
  {
    ask: "What actually matters here?",
    gives: "The terms, clauses and obligations that carry weight.",
  },
  { ask: "Explain this clause.", gives: "An explanation grounded in the clause itself." },
  { ask: "Can I trust this answer?", gives: "A visible path back to the supporting passage." },
  { ask: "Where did you get that?", gives: "The page and the readable excerpt." },
  {
    ask: "What if you cannot find it?",
    gives: "A plain 'the document doesn't say' — never a guess.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight">SELA</span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            Legal document intelligence
          </span>
        </div>
        <Link
          to="/auth"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Sign in
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-20 md:pt-20">
          <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-brass">
                Document → understanding → evidence
              </p>
              <h1 className="mt-5 font-display text-5xl leading-[1.05] md:text-6xl">
                Understand what the document says. See what matters.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Legal language buries the things you actually need: what you are agreeing to, which
                clauses deserve attention, what happens if something changes. SELA reads the
                document with you and shows you exactly where each answer comes from.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-paper transition-colors hover:bg-primary/90"
                >
                  Review a document <ArrowRight className="size-4" />
                </Link>
                <span className="text-sm text-muted-foreground">PDF or Word. Private to you.</span>
              </div>
            </div>

            <div className="paper-panel relative p-7">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <FileText className="size-4 text-brass" /> Service agreement · page 4
              </div>
              <p className="mt-5 font-display text-2xl leading-snug">
                “Either party may terminate on thirty (30) days written notice; fees paid are
                non-refundable.”
              </p>
              <div className="rule-line my-6" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Either side can end the agreement with 30 days notice in writing. Anything already
                paid stays paid — there is no refund clause attached to termination.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="source-mark source-mark-active">
                  <Quote className="size-3" /> Source · page 4
                </span>
                <span className="source-mark">Termination</span>
                <span className="source-mark">Fees</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="font-display text-3xl">What SELA gives back</h2>
            <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {promises.map((item) => (
                <div key={item.ask} className="border-l-2 border-brass/50 pl-5">
                  <p className="font-display text-xl italic">“{item.ask}”</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.gives}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl">One document, six angles</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ScanSearch,
                title: "Overview and key terms",
                body: "What the document is, who is in it, the dates that bind, and the terms as this document defines them.",
              },
              {
                icon: ShieldQuestion,
                title: "Clauses and issues",
                body: "The sections worth inspecting and the observations drawn from the text — described, never scored.",
              },
              {
                icon: Quote,
                title: "Ask and verify",
                body: "Ask in your own words. Every answer carries the passages it came from, and says so when the document falls short.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="paper-panel p-6">
                <Icon className="size-5 text-brass" />
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
          <p className="max-w-2xl">
            SELA is a reading and review aid, not a lawyer. It does not give legal advice or make
            final legal determinations. For consequential decisions, speak to a qualified
            professional.
          </p>
          <p className="mt-6 font-display text-xl text-foreground">SELA</p>
        </div>
      </footer>
    </div>
  );
}
