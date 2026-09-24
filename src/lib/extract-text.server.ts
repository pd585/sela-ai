/**
 * Server-only document text extraction (PDF / DOCX).
 * Never import this from client route modules.
 */
import type { ExtractedDocument, ExtractedPage } from "./extract-text";
import { chunkPages, validateDocumentFile } from "./extract-text";

export type { ExtractedDocument, ExtractedPage, Chunk } from "./extract-text";
export { chunkPages, validateDocumentFile };

/** pdfjs-dist (legacy) expects Promise.withResolvers; polyfill for Node < 22. */
function ensurePromiseWithResolvers(): void {
  const P = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof P.withResolvers === "function") return;
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
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
  ensurePromiseWithResolvers();
  // Explicitly import the legacy worker so Nitro/Vite bundles it into the server
  // artifact, then register it for PDF.js's fake-worker path. On Vercel, pdf.mjs is
  // inlined into `_libs/pdfjs-dist.mjs` without a sibling `pdf.worker.mjs`; without
  // this, fake-worker does `import("./pdf.worker.mjs")` → /var/task/_libs/pdf.worker.mjs.
  const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (
    globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler?: unknown };
    }
  ).pdfjsWorker = pdfjsWorker;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // View over the same ArrayBuffer — avoids an extra full copy before parse.
  const data = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
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
  // Mammoth runtime only accepts { buffer } (types mention arrayBuffer but unzip.js does not).
  // Single Buffer materialization; caller should drop the ArrayBuffer reference afterward.
  const nodeBuffer = Buffer.from(buffer);
  const result = await mammoth.extractRawText({ buffer: nodeBuffer });
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
  const byteLength = args.buffer.byteLength;
  validateDocumentFile({
    name: args.fileName,
    size: byteLength,
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
