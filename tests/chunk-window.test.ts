import { describe, expect, it } from "vitest";
import {
  CHUNK_WINDOW_SIZE,
  assembleChunks,
  batchIndices,
  clampChunkWindow,
  collectMemoChunkIndices,
  computeChunkWindow,
  initialChunkWindow,
  mergeChunkContent,
  stabilizeChunkWindow,
  windowRowCount,
} from "../src/lib/chunk-window";

describe("Wave 2 — chunk windowing", () => {
  it("bounds the initial Original load well under a full corpus", () => {
    const total = 250;
    const win = initialChunkWindow(total);
    expect(win).toEqual({ start: 0, end: CHUNK_WINDOW_SIZE - 1 });
    expect(windowRowCount(win)).toBe(CHUNK_WINDOW_SIZE);
    expect(windowRowCount(win)).toBeLessThan(total);
  });

  it("preserves ordering and chunk identity when assembling meta + content", () => {
    const meta = [
      { chunk_index: 0, page_number: 1 },
      { chunk_index: 1, page_number: 1 },
      { chunk_index: 2, page_number: 2 },
    ];
    const loaded = mergeChunkContent(new Map(), [
      { chunk_index: 2, page_number: 2, content: "c2" },
      { chunk_index: 0, page_number: 1, content: "c0" },
    ]);
    const rows = assembleChunks(meta, loaded);
    expect(rows.map((r) => r.chunk_index)).toEqual([0, 1, 2]);
    expect(rows[0]?.content).toBe("c0");
    expect(rows[1]?.content).toBe("");
    expect(rows[2]?.content).toBe("c2");
  });

  it("stabilizes tiny scroll shifts to avoid per-tick network fetches", () => {
    const prev = { start: 0, end: 29 };
    const tiny = computeChunkWindow(3, 12, 200);
    const stable = stabilizeChunkWindow(prev, tiny);
    expect(stable).not.toBeNull();
    expect(windowRowCount(stable)).toBeGreaterThanOrEqual(windowRowCount(prev));
    // A large jump should move the window.
    const jumped = computeChunkWindow(80, 95, 200);
    const moved = stabilizeChunkWindow(prev, jumped);
    expect(moved?.start).toBeGreaterThan(20);
  });

  it("collects Expert Memo indices without implying a full-corpus range", () => {
    const indices = collectMemoChunkIndices({
      sections: [{ chunk_index: 2 }, { chunk_index: 7 }],
      clauses: [{ chunk_index: 7 }, { chunk_index: 11 }],
      keyTerms: [{ chunk_index: 0 }],
      issues: [{ chunk_index: 11 }],
      citations: [{ chunkIndex: 4 }, { chunkIndex: 2 }],
    });
    expect(indices).toEqual([0, 2, 4, 7, 11]);
    const batches = batchIndices(indices, 3);
    expect(batches).toEqual([
      [0, 2, 4],
      [7, 11],
    ]);
    // Full-corpus would be 0..N; memo path must stay sparse.
    expect(Math.max(...indices) - Math.min(...indices) + 1).toBeGreaterThan(indices.length);
  });

  it("clamps windows to available chunk indices", () => {
    expect(clampChunkWindow(-5, 400, 10)).toEqual({ start: 0, end: 9 });
    expect(clampChunkWindow(0, 5, 0)).toBeNull();
  });
});
