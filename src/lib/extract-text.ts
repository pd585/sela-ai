/**
 * Browser-side text extraction for uploaded documents.
 * Only ever called from event handlers after hydration.
 */

export type ExtractedPage = { page: number; text: string };
export type ExtractedDocument = { pages: ExtractedPage[]; pageCount: number };

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** Reject unsupported or impractically large uploads before browser-side extraction. */
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

function clean(text: string) {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/\u0000/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

async function extractPdf(file: File): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });

  try {
    const pdf = await loadingTask.promise;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ");
      pages.push({ page: pageNumber, text: clean(text) });
    }

    return { pages, pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth/mammoth.browser.js")) as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = clean(result.value);
  // Word has no fixed pages; split into readable sections of roughly one page.
  const paragraphs = text.split(/\n+/).filter(Boolean);
  const pages: ExtractedPage[] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    current.push(paragraph);
    size += paragraph.length;
    if (size > 2800) {
      pages.push({ page: pages.length + 1, text: current.join("\n") });
      current = [];
      size = 0;
    }
  }
  if (current.length) pages.push({ page: pages.length + 1, text: current.join("\n") });
  return { pages, pageCount: Math.max(pages.length, 1) };
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  validateDocumentFile(file);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isDocx =
    file.type.includes("wordprocessingml") || file.name.toLowerCase().endsWith(".docx");

  if (isPdf) return extractPdf(file);
  if (isDocx) return extractDocx(file);
  throw new Error("SELA reads PDF and Word (.docx) documents.");
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
