import { describe, expect, it, vi } from "vitest";
import { extractDocument } from "../src/lib/extract-text";

const pdfjsMock = vi.hoisted(() => {
  const destroy = vi.fn(async () => undefined);
  const pages = [
    { getTextContent: vi.fn(async () => ({ items: [{ str: "Page one" }] })) },
    { getTextContent: vi.fn(async () => ({ items: [{ str: "Page two" }] })) },
  ];
  const pdf = {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
  };
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve(pdf),
    destroy,
  }));

  return { destroy, getDocument, pdf };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjsMock.getDocument,
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));

describe("PDF extraction lifecycle", () => {
  it("extracts pages and destroys the loading task after extraction", async () => {
    const file = {
      name: "contract.pdf",
      type: "application/pdf",
      arrayBuffer: async () => new ArrayBuffer(1),
    } as File;

    await expect(extractDocument(file)).resolves.toEqual({
      pages: [
        { page: 1, text: "Page one" },
        { page: 2, text: "Page two" },
      ],
      pageCount: 2,
    });

    expect(pdfjsMock.getDocument).toHaveBeenCalledOnce();
    expect(pdfjsMock.destroy).toHaveBeenCalledOnce();
    expect(pdfjsMock.pdf).not.toHaveProperty("destroy");
  });
});
