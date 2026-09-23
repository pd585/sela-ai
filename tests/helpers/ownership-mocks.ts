import { z } from "zod";

/** Mirrors ProcessInput UUID requirement used by server functions. */
export const ProcessInputLike = z.object({
  documentId: z.string().uuid(),
});

/**
 * Contract check used by IDOR tests: any owned-document query must filter by user_id.
 * If production code drops `.eq("user_id", userId)`, call sites should keep this assertion green by failing here.
 */
export function assertOwnedDocumentFilters(eqCalls: Array<[string, unknown]>): void {
  const hasId = eqCalls.some(([col]) => col === "id");
  const hasUser = eqCalls.some(([col]) => col === "user_id");
  if (!hasId) throw new Error("Owned document query missing id filter");
  if (!hasUser) throw new Error("Owned document query missing user_id filter");
}
