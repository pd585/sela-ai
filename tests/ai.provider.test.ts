import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("SELA AI Provider Engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails embedTexts gracefully when no embedding API key is present", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const { embedTexts } = await import("../src/lib/ai.server");
    await expect(embedTexts(["Sample passage"])).rejects.toThrow(
      "Embedding provider is not configured",
    );
  });

  it("fails generateStructured gracefully when no LLM API key is present", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const { generateStructured } = await import("../src/lib/ai.server");
    await expect(
      generateStructured({
        instructions: "Test instructions",
        input: "Test input",
        schemaName: "test_schema",
        schema: { type: "object" },
      }),
    ).rejects.toThrow("All configured providers failed");
  });

  it("falls back to OpenRouter when Gemini API fails", async () => {
    process.env.AI_LLM_PRIMARY_PROVIDER = "gemini";
    process.env.AI_LLM_FALLBACK_PROVIDERS = "openrouter";
    process.env.GEMINI_API_KEY = "invalid_gemini_key";
    process.env.OPENROUTER_API_KEY = "mock_openrouter_key";

    // Mock global fetch to simulate Gemini failure then OpenRouter success
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized API key"),
        });
      }
      if (url.includes("openrouter.ai")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: '{"status": "ok_from_openrouter"}' } }],
            }),
        });
      }
      return Promise.reject(new Error("Unknown endpoint"));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateStructured } = await import("../src/lib/ai.server");
    const result = await generateStructured<{ status: string }>({
      instructions: "Test",
      input: "Test",
      schemaName: "test",
      schema: { type: "object" },
    });

    expect(result).toEqual({ status: "ok_from_openrouter" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces 3072-dimensional vector format for Gemini embeddings", async () => {
    process.env.GEMINI_API_KEY = "mock_key";

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            embeddings: [{ values: new Array(3072).fill(0.1) }],
          }),
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { embedTexts } = await import("../src/lib/ai.server");
    const vectors = await embedTexts(["Test chunk"]);

    expect(vectors.length).toBe(1);
    expect(vectors[0].length).toBe(3072);
  });
});
