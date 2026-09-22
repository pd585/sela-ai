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

  it("fails generateStructured gracefully when no LLM API key is present without leaking internal details", async () => {
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
    ).rejects.toThrow("SELA could not complete this legal analysis request at this time");
  });

  it("enforces bounded token limits on OpenRouter and Gemini requests", async () => {
    process.env.GEMINI_API_KEY = "mock_gemini_key";
    process.env.OPENROUTER_API_KEY = "mock_openrouter_key";

    let geminiPayload: { generationConfig?: { maxOutputTokens?: number } } | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiPayload = JSON.parse(opts?.body || "{}");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              candidates: [{ content: { parts: [{ text: '{"answer": "gemini_bounded"}' }] } }],
            }),
        });
      }
      return Promise.reject(new Error("Unknown endpoint"));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateStructured } = await import("../src/lib/ai.server");
    const res = await generateStructured<{ answer: string }>({
      instructions: "Answer bounded question",
      input: "What are the terms?",
      schemaName: "test",
      schema: { type: "object" },
      effort: "low",
    });

    expect(res.answer).toBe("gemini_bounded");
    expect(geminiPayload?.generationConfig?.maxOutputTokens).toBe(1536);
  });

  it("falls back to OpenRouter with bounded max_tokens when Gemini fails", async () => {
    process.env.AI_LLM_PRIMARY_PROVIDER = "gemini";
    process.env.AI_LLM_FALLBACK_PROVIDERS = "openrouter";
    process.env.GEMINI_API_KEY = "invalid_gemini_key";
    process.env.OPENROUTER_API_KEY = "mock_openrouter_key";

    let openRouterPayload: { max_tokens?: number } | null = null;

    const fetchMock = vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized API key"),
        });
      }
      if (url.includes("openrouter.ai")) {
        openRouterPayload = JSON.parse(opts?.body || "{}");
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
      effort: "low",
    });

    expect(result).toEqual({ status: "ok_from_openrouter" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Explicit bounded tokens to prevent OpenRouter 402 credit exhaustion
    expect(openRouterPayload?.max_tokens).toBe(1536);
  });

  it("falls back to Ollama when OpenRouter fails with HTTP 402 insufficient credits", async () => {
    process.env.AI_LLM_PRIMARY_PROVIDER = "gemini";
    process.env.AI_LLM_FALLBACK_PROVIDERS = "openrouter,ollama";
    process.env.GEMINI_API_KEY = "invalid_gemini_key";
    process.env.OPENROUTER_API_KEY = "depleted_openrouter_key";

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Gemini Error"),
        });
      }
      if (url.includes("openrouter.ai")) {
        return Promise.resolve({
          ok: false,
          status: 402,
          text: () =>
            Promise.resolve("requested up to 65535 tokens, provider can only afford 14370 tokens"),
        });
      }
      if (url.includes("localhost:11434")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              message: { content: '{"status": "ok_from_ollama_fallback"}' },
            }),
        });
      }
      return Promise.reject(new Error("Unknown endpoint"));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { generateStructured } = await import("../src/lib/ai.server");
    const result = await generateStructured<{ status: string }>({
      instructions: "Test fallback",
      input: "Test input",
      schemaName: "test",
      schema: { type: "object" },
    });

    expect(result).toEqual({ status: "ok_from_ollama_fallback" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
