import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processDocument } from "@/lib/sela.functions";
import { extractDocument, chunkPages } from "@/lib/extract-text";
import { AppShell } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Your documents · SELA" },
      {
        name: "description",
        content: "Upload a contract or legal document and open it for review with SELA.",
      },
      { property: "og:title", content: "Your documents · SELA" },
      {
        property: "og:description",
        content: "Upload a contract or legal document and open it for review with SELA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

type DocumentRow = {
  id: string;
  title: string;
  file_name: string;
  page_count: number | null;
  status: string;
  status_detail: string | null;
  error_message: string | null;
  created_at: string;
};

function Workspace() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, title, file_name, page_count, status, status_detail, error_message, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((doc) => doc.status === "preparing") ? 3000 : false,
  });

  const handleFile = async (file: File) => {
    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId) return;

    let documentId: string | null = null;
    try {
      setUploadState("Reading the file");
      const extracted = await extractDocument(file);
      const chunks = chunkPages(extracted.pages);
      if (chunks.length === 0)
        throw new Error("No selectable text was found — SELA cannot read scanned images yet.");

      setUploadState("Storing the document");
      const storagePath = `${userId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw new Error(uploadError.message);

      const { data: created, error: createError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          title: file.name.replace(/\.(pdf|docx)$/i, ""),
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          byte_size: file.size,
          page_count: extracted.pageCount,
          storage_path: storagePath,
          status: "preparing",
          status_detail: "Preparing your document",
        })
        .select("id")
        .single();
      if (createError || !created) throw new Error(createError?.message ?? "Upload failed.");
      documentId = created.id;

      setUploadState("Saving passages");
      const rows = chunks.map((chunk) => ({
        document_id: created.id,
        user_id: userId,
        chunk_index: chunk.chunkIndex,
        page_number: chunk.page,
        content: chunk.content,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }

      setUploadState(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("SELA is preparing your document.");

      processDocument({ data: { documentId: created.id } })
        .then(() => queryClient.invalidateQueries({ queryKey: ["documents"] }))
        .catch((error: unknown) => {
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          toast.error(
            error instanceof Error ? error.message : "SELA could not prepare that document.",
          );
        });
    } catch (error) {
      setUploadState(null);
      if (documentId) await supabase.from("documents").delete().eq("id", documentId);
      toast.error(error instanceof Error ? error.message : "That upload didn't work.");
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) toast.error("That document could not be removed.");
    else queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Your documents</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              PDF or Word. Each document stays private to your account.
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()} disabled={Boolean(uploadState)}>
            {uploadState ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {uploadState}
              </>
            ) : (
              <>
                <Upload className="size-4" /> Upload a document
              </>
            )}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </div>

        <div className="mt-10 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your documents…</p>}

          {!isLoading && documents.length === 0 && (
            <div className="paper-panel p-10 text-center">
              <FileText className="mx-auto size-6 text-brass" />
              <h2 className="mt-4 font-display text-2xl">Start with one document</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Upload a contract, lease, policy or agreement. SELA reads it, shows what matters,
                and answers your questions with the passage it used.
              </p>
            </div>
          )}

          {documents.map((doc) => {
            const preparing = doc.status === "preparing";
            const failed = doc.status === "failed";
            return (
              <div
                key={doc.id}
                className="paper-panel flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-xl">{doc.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doc.file_name}
                    {doc.page_count ? ` · ${doc.page_count} pages` : ""} ·{" "}
                    {failed
                      ? (doc.error_message ?? "Could not be prepared")
                      : preparing
                        ? (doc.status_detail ?? "Preparing your document")
                        : "Ready for review"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {preparing && <Loader2 className="size-4 animate-spin text-brass" />}
                  {!preparing && !failed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: "/documents/$documentId",
                          params: { documentId: doc.id },
                        })
                      }
                    >
                      Open review
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove document"
                    onClick={() => void remove(doc.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Need the landing page?{" "}
          <Link to="/" className="underline underline-offset-4">
            Back to SELA
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
