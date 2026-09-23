import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASK_CONTEXT_CHAR_BUDGET,
  PROCESS_CONTEXT_CHAR_BUDGET,
  askNeedsExternalResearch,
  buildContext,
  resolveAskSearchMode,
} from "../src/lib/sela.functions";
import { assertRateLimit, resetRateLimitsForTests } from "../src/lib/rate-limit";
import { validateDocumentFile, MAX_DOCUMENT_SIZE_BYTES } from "../src/lib/extract-text";

describe("Wave 1 — Ask mode gates", () => {
  it("resolves document-only and never flags external research", () => {
    expect(resolveAskSearchMode({ searchMode: "document" })).toBe("document");
    expect(resolveAskSearchMode({ verifyExternal: false, searchMode: "document" })).toBe(
      "document",
    );
    expect(askNeedsExternalResearch("document")).toBe(false);
  });

  it("enables external research only for both/external scopes", () => {
    expect(resolveAskSearchMode({ searchMode: "both" })).toBe("both");
    expect(resolveAskSearchMode({ verifyExternal: true })).toBe("both");
    expect(resolveAskSearchMode({ searchMode: "external" })).toBe("external");
    expect(askNeedsExternalResearch("both")).toBe(true);
    expect(askNeedsExternalResearch("external")).toBe(true);
  });
});

describe("Wave 1 — context dedupe & budgets", () => {
  it("keeps multiple distinct passages and skips near-duplicates", () => {
    const chunks = [
      {
        chunk_index: 0,
        page_number: 1,
        content: "The Consultant shall deliver milestone deliverables within thirty days.",
      },
      {
        chunk_index: 1,
        page_number: 1,
        content: "The Consultant shall deliver milestone deliverables within thirty days.",
      },
      {
        chunk_index: 2,
        page_number: 2,
        content: "Payment of $50,000 is due within 30 days of Acceptance.",
      },
      {
        chunk_index: 3,
        page_number: 3,
        content: "Disputes are resolved by binding arbitration in New York.",
      },
    ];

    const ctx = buildContext(chunks, ASK_CONTEXT_CHAR_BUDGET);
    expect(ctx).toContain("Passage ID: 0");
    expect(ctx).not.toContain("Passage ID: 1"); // duplicate skipped
    expect(ctx).toContain("Passage ID: 2");
    expect(ctx).toContain("Passage ID: 3");
    expect(ctx).toContain("$50,000");
    expect(ASK_CONTEXT_CHAR_BUDGET).toBe(45000);
    expect(PROCESS_CONTEXT_CHAR_BUDGET).toBe(70000);
  });

  it("preserves citation passage IDs for higher-ranked matches under budget", () => {
    const chunks = Array.from({ length: 5 }, (_, i) => ({
      chunk_index: i,
      page_number: i + 1,
      content: `Unique obligation clause number ${i} with distinct parties and dates ${2020 + i}.`,
    }));
    const ctx = buildContext(chunks, 500);
    // First passages preferred; Passage ID labels remain mappable for citations
    expect(ctx).toContain("[Passage ID: 0 | Page 1]");
    expect(ctx.match(/Passage ID:/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Wave 1 — rate limiter", () => {
  afterEach(() => {
    resetRateLimitsForTests();
  });

  it("allows requests under the limit and blocks when exceeded", () => {
    const user = "user-rate-limit-test";
    for (let i = 0; i < 5; i++) {
      expect(() => assertRateLimit(user, "process")).not.toThrow();
    }
    expect(() => assertRateLimit(user, "process")).toThrow(/Too many process requests/);
    // Independent buckets per action
    expect(() => assertRateLimit(user, "ask")).not.toThrow();
  });
});

describe("Wave 1 — extract validation still works", () => {
  it("rejects empty, oversized, and unsupported uploads", () => {
    expect(() =>
      validateDocumentFile({ name: "empty.pdf", size: 0, type: "application/pdf" }),
    ).toThrow("non-empty");
    expect(() =>
      validateDocumentFile({
        name: "too-large.pdf",
        size: MAX_DOCUMENT_SIZE_BYTES + 1,
        type: "application/pdf",
      }),
    ).toThrow("25 MB");
    expect(() => validateDocumentFile({ name: "notes.txt", size: 50, type: "text/plain" })).toThrow(
      "PDF and Word",
    );
  });
});

describe("Wave 1 — explain translation batching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("uses ≤1 translation model call for non-en explanatory fields", async () => {
    process.env.GEMINI_API_KEY = "mock_key";
    let structuredCalls = 0;

    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: { body?: string }) => {
      structuredCalls += 1;
      const body = JSON.parse(opts?.body || "{}");
      const schemaName =
        body.generationConfig?.responseSchema?.title ||
        body.generationConfig?.responseMimeType ||
        "";
      void schemaName;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      section_title: "విభాగం",
                      what_it_says: "చెల్లింపు $50,000",
                      why_it_matters: "గడువు",
                      who_it_affects: "Client",
                      what_happens: "Payment due",
                      important_dates: "15 March 2026",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { translateExplanatoryFieldsBatch } = await import("../src/lib/ai.server");
    const result = await translateExplanatoryFieldsBatch({
      fields: {
        section_title: "Payment",
        what_it_says: "Payment of $50,000 due within 30 days of 15 March 2026.",
        why_it_matters: "Sets the payment deadline.",
        who_it_affects: "Client",
        what_happens: "Late payment accrues interest.",
        important_dates: "15 March 2026",
      },
      targetLanguage: "te",
    });

    expect(structuredCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.what_it_says).toContain("$50,000");
    expect(result.important_dates).toContain("15 March 2026");
  });

  it("skips translation model calls when language is en", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { translateExplanatoryFieldsBatch } = await import("../src/lib/ai.server");
    const fields = {
      what_it_says: "Payment due in 30 days.",
      why_it_matters: "Deadline",
    };
    const result = await translateExplanatoryFieldsBatch({
      fields,
      targetLanguage: "en",
    });
    expect(result).toEqual(fields);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
