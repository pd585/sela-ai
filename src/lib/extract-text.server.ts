/**
 * Server-only document text extraction (PDF / DOCX).
 * Never import this from client route modules.
 */
import type { ExtractedDocument, ExtractedPage } from "./extract-text";
import { chunkPages, validateDocumentFile } from "./extract-text";

export type { ExtractedDocument, ExtractedPage, Chunk } from "./extract-text";
export { chunkPages, validateDocumentFile };

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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function extractPdfFromBuffer(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Server extraction: disable worker (Node has no dedicated worker thread setup here).
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    const pages = await mapPool(pageNumbers, 4, async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item: unknown) =>
            item && typeof item === "object" && "str" in item
              ? String((item as { str: string }).str)
              : "",
          )
          .join(" ")
          .replace(/\s+/g, " ");
        return { page: pageNumber, text: clean(text) } satisfies ExtractedPage;
      } finally {
        page.cleanup();
      }
    });

    return { pages, pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractDocxFromBuffer(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const text = clean(result.value);
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

export async function extractDocumentFromBuffer(args: {
  buffer: ArrayBuffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<ExtractedDocument> {
  const fileName = args.fileName.toLowerCase();
  const mime = args.mimeType ?? "";
  validateDocumentFile({
    name: args.fileName,
    size: args.buffer.byteLength,
    type:
      mime ||
      (fileName.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  });

  const isPdf = mime === "application/pdf" || fileName.endsWith(".pdf");
  const isDocx = mime.includes("wordprocessingml") || fileName.endsWith(".docx");

  if (isPdf) return extractPdfFromBuffer(args.buffer);
  if (isDocx) return extractDocxFromBuffer(args.buffer);
  throw new Error("SELA reads PDF and Word (.docx) documents.");
}

export function extractAndChunkFromBuffer(args: {
  buffer: ArrayBuffer;
  fileName: string;
  mimeType?: string | null;
}) {
  return extractDocumentFromBuffer(args).then((extracted) => ({
    extracted,
    chunks: chunkPages(extracted.pages),
  }));
}
