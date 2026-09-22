import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/sela/shell";

function titleFor(title: string, fileName: string) {
  const source = /^[a-f0-9]{24,}$/i.test(title) ? fileName.replace(/\.(pdf|docx)$/i, "") : title;
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ReviewPage() {
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["review-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_name, page_count, status")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Review</p>
        <h1 className="mt-2 font-display text-5xl">Continue a review</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Return to a document in your workspace. This view shows documents currently available to
          review.
        </p>
        <div className="mt-10 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your documents...</p>}
          {!isLoading && !documents.length && (
            <div className="paper-panel p-10 text-center">
              <FileText className="mx-auto size-6 text-brass" />
              <h2 className="mt-4 font-display text-2xl">No reviews yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a document to begin a grounded review.
              </p>
            </div>
          )}
          {documents.map((document) => {
            const ready = document.status === "ready";
            const cardContent = (
              <div className="paper-panel flex items-center justify-between gap-4 p-5 transition-shadow hover:shadow-lift">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl">
                    {titleFor(document.title, document.file_name)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {document.file_name}
                    {document.page_count ? ` · ${document.page_count} pages` : ""} ·{" "}
                    {ready
                      ? "Ready for review"
                      : document.status === "failed"
                        ? "Unable to process"
                        : "Processing"}
                  </p>
                </div>
                {ready && <ArrowRight className="size-5 shrink-0 text-brass" />}
              </div>
            );

            return ready ? (
              <Link
                key={document.id}
                to="/app/documents/$documentId/review"
                params={{ documentId: document.id }}
                className="block"
              >
                {cardContent}
              </Link>
            ) : (
              <Link key={document.id} to="/app/documents" className="block">
                {cardContent}
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
