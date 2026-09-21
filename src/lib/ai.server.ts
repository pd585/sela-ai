/**
 * Server-only AI service for SELA legal document analysis and RAG.
 * Provider-agnostic abstraction supporting Google Gemini Direct, OpenRouter, and Ollama.
 * Never import this from client code.
 */

type JsonSchema = Record<string, unknown>;

type StructuredArgs = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
};

// ---------------------------------------------------------------------------
// 1. EMBEDDING ENGINE (Strict 3072-dimensional Gemini vector contract)
// ---------------------------------------------------------------------------

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  const embedModel = process.env["EMBEDDING_MODEL"] || "gemini-embedding-2";

  if (!geminiKey && !openRouterKey) {
    throw new Error(
      "Embedding provider is not configured. Please set GEMINI_API_KEY or OPENROUTER_API_KEY in your server environment.",
    );
  }

  const out: number[][] = [];
  const batchSize = 24;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    if (geminiKey) {
      // Direct Google Gemini API
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${embedModel}:batchEmbedContents?key=${geminiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${embedModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: 3072,
          })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini Embedding API failed [${res.status}]: ${errText}`);
      }

      const json = (await res.json()) as {
        embeddings?: Array<{ values: number[] }>;
      };

      if (!json.embeddings || json.embeddings.length !== batch.length) {
        throw new Error("Gemini Embedding API returned incomplete vector data.");
      }

      for (const item of json.embeddings) {
        if (item.values.length !== 3072) {
          throw new Error(
            `Embedding dimension mismatch: expected 3072, received ${item.values.length}`,
          );
        }
        out.push(item.values);
      }
    } else if (openRouterKey) {
      // OpenRouter API fallback for embeddings
      const url = "https://openrouter.ai/api/v1/embeddings";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: process.env["OPENROUTER_EMBED_MODEL"] || "google/gemini-embedding-2",
          input: batch,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter Embedding API failed [${res.status}]: ${errText}`);
      }

      const json = (await res.json()) as {
        data: Array<{ embedding: number[]; index?: number }>;
      };
      const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const item of sorted) {
        if (item.embedding.length !== 3072) {
          throw new Error(
            `Embedding dimension mismatch: expected 3072, received ${item.embedding.length}`,
          );
        }
        out.push(item.embedding);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 2. PROVIDER DRIVERS (Gemini Direct, OpenRouter, Ollama)
// ---------------------------------------------------------------------------

async function callGeminiDirect<T>(args: StructuredArgs): Promise<T> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env["GEMINI_LLM_MODEL"] || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: args.instructions }] },
      contents: [{ parts: [{ text: args.input }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: args.schema,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Direct API error [${res.status}]: ${errText}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini Direct returned empty response.");
  return parseJsonText<T>(text);
}

async function callOpenRouter<T>(args: StructuredArgs): Promise<T> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  const model = process.env["OPENROUTER_LLM_MODEL"] || "google/gemini-2.5-flash";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: args.instructions },
        { role: "user", content: args.input },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error [${res.status}]: ${errText}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned empty response.");
  return parseJsonText<T>(text);
}

async function callOllama<T>(args: StructuredArgs): Promise<T> {
  const baseUrl = process.env["OLLAMA_BASE_URL"] || "http://localhost:11434";
  const model = process.env["OLLAMA_LLM_MODEL"] || "llama3.2";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: args.instructions },
        { role: "user", content: args.input },
      ],
      format: "json",
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama API error [${res.status}]: ${errText}`);
  }

  const json = (await res.json()) as {
    message?: { content?: string };
  };

  const text = json.message?.content;
  if (!text) throw new Error("Ollama returned empty response.");
  return parseJsonText<T>(text);
}

function parseJsonText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error("Could not parse valid JSON from AI model response.");
  }
}

// ---------------------------------------------------------------------------
// 3. MULTI-PROVIDER ROUTER WITH AUTOMATIC FALLBACK
// ---------------------------------------------------------------------------

export async function generateStructured<T>(args: StructuredArgs): Promise<T> {
  const primary = (process.env["AI_LLM_PRIMARY_PROVIDER"] || "gemini").toLowerCase();
  const rawFallbacks = process.env["AI_LLM_FALLBACK_PROVIDERS"] || "openrouter,ollama";
  const fallbacks = rawFallbacks.split(",").map((s) => s.trim().toLowerCase());

  const providerChain = Array.from(new Set([primary, ...fallbacks]));
  const errors: string[] = [];

  for (const provider of providerChain) {
    try {
      if (provider === "gemini") {
        return await callGeminiDirect<T>(args);
      } else if (provider === "openrouter") {
        return await callOpenRouter<T>(args);
      } else if (provider === "ollama") {
        return await callOllama<T>(args);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Provider Fallback] ${provider} failed: ${msg}`);
      errors.push(`${provider}: ${msg}`);
    }
  }

  throw new Error(`SELA AI Service error. All configured providers failed:\n${errors.join("\n")}`);
}
