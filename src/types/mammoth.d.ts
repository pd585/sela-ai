declare module "mammoth/mammoth.browser.js" {
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: string[] }>;
}

declare module "mammoth" {
  export function extractRawText(input: {
    buffer: Buffer;
  }): Promise<{ value: string; messages: string[] }>;
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: unknown): {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
        cleanup: () => void;
      }>;
    }>;
    destroy: () => Promise<void>;
  };
}

declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
