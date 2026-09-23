import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processDocument } from "@/lib/sela.functions";
import { validateDocumentFile } from "@/lib/extract-text";
import { rollbackFailedUpload } from "@/lib/upload-rollback";
import { AppShell } from "@/components/sela/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileText, Loader2, Search, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/app/documents" });
  },
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
  storage_path: string | null;
  created_at: string;
};

function displayTitle(title: string, fileName: string) {
  const looksLikeId = /^[a-f0-9]{24,}$/i.test(title);
  const source = looksLikeId ? fileName.replace(/\.(pdf|docx)$/i, "") : title;
  return source
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function Workspace() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [docToDelete, setDocToDelete] = useState<DocumentRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, title, file_name, page_count, status, status_detail, error_message, storage_path, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((doc) => doc.status === "preparing") ? 3000 : false,
  });

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (doc) => doc.title.toLowerCase().includes(q) || doc.file_name.toLowerCase().includes(q),
    );
  }, [documents, searchQuery]);

  const handleFile = async (file: File) => {
    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId) return;

    let documentId: string | null = null;
    let storagePath: string | null = null;
    try {
      validateDocumentFile(file);

      setUploadState("Storing the document");
      storagePath = `${userId}/${crypto.randomUUID()}-${file.name}`;
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
          storage_path: storagePath,
          status: "preparing",
          status_detail: "Preparing your document",
        })
        .select("id")
        .single();
      if (createError || !created) throw new Error(createError?.message ?? "Upload failed.");
      documentId = created.id;

      setUploadState(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("SELA is preparing your document.");

      // Server downloads, extracts, chunks, embeds, and analyzes — keeps pdfjs/mammoth off the client graph.
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
      await rollbackFailedUpload({
        client: supabase,
        storagePath,
        documentId,
      });
      toast.error(error instanceof Error ? error.message : "That upload didn't work.");
    }
  };

  const confirmRemove = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      if (docToDelete.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove([docToDelete.storage_path]);
        if (storageError) {
          toast.error("That document file could not be removed.");
          return;
        }
      }
      const { error } = await supabase.from("documents").delete().eq("id", docToDelete.id);
      if (error) {
        toast.error("That document could not be removed.");
      } else {
        toast.success("Document removed.");
        queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    } finally {
      setIsDeleting(false);
      setDocToDelete(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-brass">My desk</p>
            <h1 className="mt-2 font-display text-4xl">Your documents</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              PDF or Word. Private to your account, ready for a grounded review.
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
            id="sela-document-upload"
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            aria-label="Upload a PDF or Word document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </div>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {uploadState
            ? uploadState
            : documents.some((d) => d.status === "preparing")
              ? "A document is processing."
              : documents.some((d) => d.status === "failed")
                ? "A document failed to process."
                : documents.some((d) => d.status === "ready")
                  ? "Documents ready for review."
                  : ""}
        </div>

        {documents.length > 0 && (
          <div className="relative mt-8 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="sela-document-search"
              type="search"
              placeholder="Search documents…"
              aria-label="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <div className="mt-6 space-y-3">
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

          {!isLoading && documents.length > 0 && filteredDocuments.length === 0 && (
            <p className="paper-panel p-6 text-sm text-muted-foreground">
              No documents match &ldquo;{searchQuery}&rdquo;.
            </p>
          )}

          {filteredDocuments.map((doc) => {
            const preparing = doc.status === "preparing";
            const failed = doc.status === "failed";
            const title = displayTitle(doc.title, doc.file_name);
            return (
              <div
                key={doc.id}
                className="paper-panel flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-xl">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doc.file_name}
                    {doc.page_count ? ` · ${doc.page_count} pages` : ""} ·{" "}
                    <span
                      aria-live={preparing || failed ? "assertive" : "polite"}
                      aria-atomic="true"
                    >
                      {failed
                        ? `Unable to process · ${doc.error_message ?? "Please try again"}`
                        : preparing
                          ? doc.status_detail || "Processing"
                          : "Ready for review"}
                    </span>
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
                          to: "/app/documents/$documentId/review",
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
                    onClick={() => setDocToDelete(doc)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <AlertDialog
          open={Boolean(docToDelete)}
          onOpenChange={(open) => !open && setDocToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{docToDelete?.title}&rdquo; along with its
                extracted passages, vector embeddings, and question history. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void confirmRemove();
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Removing…" : "Remove Document"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
