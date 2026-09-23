import { afterEach, describe, expect, it, vi } from "vitest";

describe("SELA security boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("bounds explanation input and rejects malformed payloads", async () => {
    const { parseExplainInput } = await import("../src/lib/sela.functions");
    const documentId = "11111111-1111-4111-8111-111111111111";

    expect(() =>
      parseExplainInput({ documentId, text: "x".repeat(12001), language: "en" }),
    ).toThrow();
    expect(parseExplainInput({ documentId, chunkIndex: 0 }).chunkIndex).toBe(0);
  });

  it("keeps only safe HTTP(S) external source links", async () => {
    process.env.GEMINI_API_KEY = "mock_key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: "NEEDS CONTEXT",
                    summary: "Review the applicable public sources.",
                    sources: [
                      { title: "Unsafe", url: "javascript:alert(1)" },
                      { title: "Safe", url: "https://example.com/source" },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { verifyExternalSources } = await import("../src/lib/ai.server");
    const result = await verifyExternalSources({ question: "What applies?" });

    expect(result.sources).toEqual([{ title: "Safe", url: "https://example.com/source" }]);
  });
});
