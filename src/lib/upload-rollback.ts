/**
 * Client-side upload failure cleanup: remove storage object and document row
 * so a failed upload leaves no orphans. Used by the workspace upload path.
 */

export type UploadRollbackClient = {
  storage: {
    from: (bucket: string) => {
      remove: (
        paths: string[],
      ) =>
        PromiseLike<{ error: { message: string } | null }> | { error: { message: string } | null };
    };
  };
  from: (table: string) => {
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) =>
        PromiseLike<{ error: { message: string } | null }> | { error: { message: string } | null };
    };
  };
};

export type UploadRollbackArgs = {
  client: UploadRollbackClient;
  storagePath?: string | null;
  documentId?: string | null;
  storageBucket?: string;
};

/**
 * Best-effort rollback after a failed upload/create.
 * Storage is removed first when present; then the documents row.
 * Returns which steps succeeded for tests / diagnostics.
 */
export async function rollbackFailedUpload(args: UploadRollbackArgs): Promise<{
  storageRemoved: boolean;
  documentDeleted: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let storageRemoved = false;
  let documentDeleted = false;
  const bucket = args.storageBucket ?? "documents";

  if (args.storagePath) {
    const { error } = await Promise.resolve(
      args.client.storage.from(bucket).remove([args.storagePath]),
    );
    if (error) errors.push(`storage: ${error.message}`);
    else storageRemoved = true;
  }

  if (args.documentId) {
    const { error } = await Promise.resolve(
      args.client.from("documents").delete().eq("id", args.documentId),
    );
    if (error) errors.push(`documents: ${error.message}`);
    else documentDeleted = true;
  }

  return { storageRemoved, documentDeleted, errors };
}
