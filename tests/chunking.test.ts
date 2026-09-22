import { describe, it, expect } from "vitest";
import { chunkPages } from "../src/lib/extract-text";

describe("SELA Chunking Engine", () => {
  it("preserves short pages as individual chunks", () => {
    const pages = [
      { page: 1, text: "This is page one text." },
      { page: 2, text: "This is page two text." },
    ];

    const chunks = chunkPages(pages, 1400, 180);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual({ chunkIndex: 0, page: 1, content: "This is page one text." });
    expect(chunks[1]).toEqual({ chunkIndex: 1, page: 2, content: "This is page two text." });
  });

  it("splits long text across sentence boundaries with overlap", () => {
    const sentence1 =
      "The party of the first part hereby agrees to furnish all materials and labor necessary.";
    const sentence2 =
      "The party of the second part agrees to remit payment in full within thirty business days.";
    const sentence3 =
      "Any dispute arising under this Agreement shall be resolved through binding arbitration in New York.";
    const longText = `${sentence1} ${sentence2} ${sentence3}`;

    // Target length small enough to force split
    const chunks = chunkPages([{ page: 1, text: longText }], 100, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.page === 1)).toBe(true);
    // Ensure all chunks have index assigned sequentially
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
    });
  });

  it("skips empty or whitespace-only pages", () => {
    const pages = [
      { page: 1, text: "   \n\t  " },
      { page: 2, text: "Valid content here." },
      { page: 3, text: "" },
    ];

    const chunks = chunkPages(pages, 1400, 180);
    expect(chunks.length).toBe(1);
    expect(chunks[0].page).toBe(2);
    expect(chunks[0].content).toBe("Valid content here.");
  });
});
