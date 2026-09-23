import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chunkPages } from "../src/lib/extract-text";
import {
  extractAndChunkFromBuffer,
  extractDocumentFromBuffer,
} from "../src/lib/extract-text.server";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("Wave 2 — server extraction fixtures", () => {
  it("extracts selectable text from a minimal PDF fixture", async () => {
    const bytes = readFileSync(join(fixtures, "sample-contract.pdf"));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const extracted = await extractDocumentFromBuffer({
      buffer: ab,
      fileName: "sample-contract.pdf",
      mimeType: "application/pdf",
    });
    expect(extracted.pageCount).toBeGreaterThanOrEqual(1);
    const joined = extracted.pages.map((p) => p.text).join(" ");
    expect(joined).toMatch(/\$50,000|50000|payment/i);
  });

  it("extracts text from a minimal DOCX fixture and chunks retain content", async () => {
    const bytes = readFileSync(join(fixtures, "sample-contract.docx"));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { extracted, chunks } = await extractAndChunkFromBuffer({
      buffer: ab,
      fileName: "sample-contract.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(extracted.pageCount).toBeGreaterThanOrEqual(1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toMatch(/sixty \(60\) days/i);
    expect(chunks[0]?.content).toMatch(/\$25,000/);
    // chunk identity ordering
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("rejects malformed PDF/DOCX without inventing passages", async () => {
    const badPdf = readFileSync(join(fixtures, "malformed.pdf"));
    const badPdfAb = badPdf.buffer.slice(badPdf.byteOffset, badPdf.byteOffset + badPdf.byteLength);
    await expect(
      extractDocumentFromBuffer({
        buffer: badPdfAb,
        fileName: "malformed.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toBeTruthy();

    const badDocx = readFileSync(join(fixtures, "malformed.docx"));
    const badDocxAb = badDocx.buffer.slice(
      badDocx.byteOffset,
      badDocx.byteOffset + badDocx.byteLength,
    );
    await expect(
      extractDocumentFromBuffer({
        buffer: badDocxAb,
        fileName: "malformed.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).rejects.toBeTruthy();
  });

  it("chunkPages keeps citation-friendly sequential indices", () => {
    const chunks = chunkPages([
      { page: 1, text: "Alpha clause. ".repeat(40) },
      { page: 2, text: "Beta obligation payment terms." },
    ]);
    expect(chunks.length).toBeGreaterThan(0);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.chunkIndex).toBe(i);
      expect(chunks[i]?.page).toBeGreaterThanOrEqual(1);
      expect(chunks[i]?.content.length).toBeGreaterThan(0);
    }
  });
});
