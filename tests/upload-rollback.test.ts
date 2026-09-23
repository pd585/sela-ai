import { describe, expect, it, vi } from "vitest";
import { rollbackFailedUpload } from "../src/lib/upload-rollback";

describe("Wave 2 — upload rollback", () => {
  it("removes storage object and document row on failure (no orphans)", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(async () => ({ error: null }));
    const del = vi.fn(() => ({ eq }));
    const client = {
      storage: { from: vi.fn(() => ({ remove })) },
      from: vi.fn(() => ({ delete: del })),
    };

    const result = await rollbackFailedUpload({
      client,
      storagePath: "user-a/file.pdf",
      documentId: "11111111-1111-4111-8111-111111111111",
    });

    expect(client.storage.from).toHaveBeenCalledWith("documents");
    expect(remove).toHaveBeenCalledWith(["user-a/file.pdf"]);
    expect(client.from).toHaveBeenCalledWith("documents");
    expect(eq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ storageRemoved: true, documentDeleted: true, errors: [] });
  });

  it("still deletes the DB row when only documentId is present", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const client = {
      storage: { from: vi.fn() },
      from: vi.fn(() => ({ delete: () => ({ eq }) })),
    };
    const result = await rollbackFailedUpload({
      client,
      documentId: "11111111-1111-4111-8111-111111111111",
    });
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(result.storageRemoved).toBe(false);
    expect(result.documentDeleted).toBe(true);
  });

  it("records errors without throwing so callers can surface upload failure", async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async () => ({ error: { message: "storage down" } })),
        })),
      },
      from: vi.fn(() => ({
        delete: () => ({
          eq: vi.fn(async () => ({ error: { message: "db down" } })),
        }),
      })),
    };
    const result = await rollbackFailedUpload({
      client,
      storagePath: "x",
      documentId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.storageRemoved).toBe(false);
    expect(result.documentDeleted).toBe(false);
    expect(result.errors.join(" ")).toMatch(/storage down/);
    expect(result.errors.join(" ")).toMatch(/db down/);
  });
});
