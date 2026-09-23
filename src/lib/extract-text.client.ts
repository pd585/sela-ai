/**
 * Browser-only PDF/DOCX extraction. Prefer server extract for upload path.
 * Kept for unit tests and any optional client fallback.
 */
import type { ExtractedDocument, ExtractedPage } from "./extract-text";
import { validateDocumentFile } from "./extract-text";

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
