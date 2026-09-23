/**
 * Shared document validation and chunking (safe for client + server).
 * Browser PDF/DOCX extraction lives in extract-text.client.ts;
 * server extraction lives in extract-text.server.ts.
 */

export type ExtractedPage = { page: number; text: string };
export type ExtractedDocument = { pages: ExtractedPage[]; pageCount: number };

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** Reject unsupported or impractically large uploads before extraction. */
export function validateDocumentFile(file: Pick<File, "name" | "size" | "type">): void {
  const fileName = file.name.toLowerCase();
  const extension = fileName.endsWith(".pdf")
    ? "pdf"
    : fileName.endsWith(".docx")
      ? "docx"
      : undefined;

  if (!extension) {
    throw new Error("SELA reads PDF and Word (.docx) documents.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Choose a non-empty document to upload.");
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("Documents must be 25 MB or smaller.");
  }
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("SELA reads PDF and Word (.docx) documents.");
  }
}

export type Chunk = { chunkIndex: number; page: number; content: string };

/** Split extracted pages into overlapping passages SELA can cite. */
export function chunkPages(pages: ExtractedPage[], target = 1400, overlap = 180): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    if (text.length <= target) {
      chunks.push({ chunkIndex: index++, page: page.page, content: text });
      continue;
    }
    const sentences = text.split(/(?<=[.;:!?])\s+/);
    let buffer = "";
    for (const sentence of sentences) {
      if (buffer.length + sentence.length > target && buffer) {
        chunks.push({ chunkIndex: index++, page: page.page, content: buffer.trim() });
        buffer = `${buffer.slice(-overlap)} ${sentence}`;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer.trim())
      chunks.push({ chunkIndex: index++, page: page.page, content: buffer.trim() });
  }

  return chunks;
}
