import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { parseExplainInput, parseTranslateInput } from "./sela.validation";

const ProcessInput = z.object({ documentId: z.string().uuid() });
const AskInput = z.object({
  documentId: z.string().uuid(),
  question: z.string().min(3).max(1000),
  verifyExternal: z.boolean().optional().default(false),
  searchMode: z.enum(["document", "both", "external"]).optional().default("document"),
});

export { parseExplainInput, parseTranslateInput } from "./sela.validation";

export type Citation = { chunkIndex: number; page: number; excerpt: string };

export type DocumentOverview = {
  document_type: string;
  purpose: string;
  summary: string;
  parties: string[];
  dates: Array<{ label: string; detail: string; chunk_index: number }>;
  what_matters_first: string[];
};

/** Coerce soft-schema / truncated analysis JSON into a safe overview for the review UI.
 * Preserves extra persisted fields (e.g. sela_version, translations) while defaulting arrays.
 */
export function normalizeDocumentOverview(raw: unknown): DocumentOverview | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<DocumentOverview> & Record<string, unknown>;
  return {
    ...o,
    document_type: typeof o.document_type === "string" ? o.document_type : "",
    purpose: typeof o.purpose === "string" ? o.purpose : "",
    summary: typeof o.summary === "string" ? o.summary : "",
    parties: Array.isArray(o.parties)
      ? o.parties.filter((p): p is string => typeof p === "string")
      : [],
    dates: Array.isArray(o.dates)
      ? o.dates.filter(
          (d): d is DocumentOverview["dates"][number] =>
            !!d &&
            typeof d === "object" &&
            typeof (d as { label?: unknown }).label === "string" &&
            typeof (d as { detail?: unknown }).detail === "string" &&
            typeof (d as { chunk_index?: unknown }).chunk_index === "number",
        )
      : [],
    what_matters_first: Array.isArray(o.what_matters_first)
      ? o.what_matters_first.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export type KeyTerm = { term: string; meaning_in_document: string; chunk_index: number };

export type ClauseFinding = {
  title: string;
  what_it_says: string;
  why_inspect: string;
  chunk_index: number;
};

export type IssueFinding = { title: string; observation: string; chunk_index: number };

export type VisualItem = {
  label: string;
  detail?: string | undefined;
  step?: number | undefined;
};

export type VisualIntelligence = {
  type:
    | "timeline"
    | "obligation_flow"
    | "responsibility_map"
    | "process_flow"
    | "clause_relationship"
    | "decision_tree"
    | "key_dates";
  title: string;
  items: VisualItem[];
};

export type SelaVersionSection = {
  section_title: string;
  chunk_index: number;
  page_number: number;
  what_it_says: string;
  why_it_matters?: string | undefined;
  who_it_affects?: string | undefined;
  what_happens?: string | undefined;
  important_dates?: string | undefined;
  visual?: VisualIntelligence | undefined;
};

export type SelaVersion = {
  summary: string;
  sections: SelaVersionSection[];
};

export type Analysis = {
  overview: DocumentOverview;
  key_terms: KeyTerm[];
  clauses: ClauseFinding[];
  issues: IssueFinding[];
  sela_version: SelaVersion;
};

const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

const analysisSchema = obj({
  overview: obj({
    document_type: { type: "string" },
    purpose: { type: "string" },
    summary: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    dates: {
      type: "array",
      items: obj({
        label: { type: "string" },
        detail: { type: "string" },
        chunk_index: { type: "integer" },
      }),
    },
    what_matters_first: { type: "array", items: { type: "string" } },
  }),
  key_terms: {
    type: "array",
    items: obj({
      term: { type: "string" },
      meaning_in_document: { type: "string" },
      chunk_index: { type: "integer" },
    }),
  },
  clauses: {
    type: "array",
    items: obj({
      title: { type: "string" },
      what_it_says: { type: "string" },
      why_inspect: { type: "string" },
      chunk_index: { type: "integer" },
    }),
  },
  issues: {
    type: "array",
    items: obj({
      title: { type: "string" },
      observation: { type: "string" },
      chunk_index: { type: "integer" },
    }),
  },
  sela_version: obj({
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_title: { type: "string" },
          chunk_index: { type: "integer" },
          page_number: { type: "integer" },
          what_it_says: { type: "string" },
          why_it_matters: { type: "string" },
          who_it_affects: { type: "string" },
          what_happens: { type: "string" },
          important_dates: { type: "string" },
          visual: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "timeline",
                  "obligation_flow",
                  "responsibility_map",
                  "process_flow",
                  "clause_relationship",
                  "decision_tree",
                  "key_dates",
                ],
              },
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    detail: { type: "string" },
                    step: { type: "integer" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["type", "title", "items"],
          },
        },
        required: ["section_title", "chunk_index", "page_number", "what_it_says"],
      },
    },
  }),
});

const answerSchema = obj({
  sufficient: { type: "boolean" },
  answer: { type: "string" },
  citations: { type: "array", items: { type: "integer" } },
  follow_ups: { type: "array", items: { type: "string" } },
});

const ANALYSIS_INSTRUCTIONS = `You are SELA, a precise legal-document intelligence system.
You are given numbered passages from ONE document. Work ONLY from those passages.
Rules:
1. SELA'S VERSION must be a faithful, source-grounded representation of the document for understanding and review.
   Preserve all obligations, rights, conditions, exceptions, qualifications, dates, amounts, parties, and ambiguities.
   Never invent information. Never silently resolve ambiguity.
   Structure sections with: WHAT IT SAYS, WHY IT MATTERS, WHO IT AFFECTS, WHAT HAPPENS, IMPORTANT DATES, and VISUAL (where helpful: timeline, obligation_flow, responsibility_map, process_flow).
   CRITICAL FIDELITY & GROUNDING CONSTRAINTS:
   - Every field must be strictly grounded in the passage.
   - If a field (e.g. who_it_affects, what_happens, important_dates) is not specified or supported in that passage, omit it or leave it undefined.
   - NEVER generate generic filler such as "Operates according to standard contract terms", "Standard rules apply", or boilerplate.
   - For who_it_affects, include ONLY the specific entities or roles explicitly mentioned in that clause. Never copy document-wide parties.
2. "overview": Extract document type, core purpose, overall summary, named parties, binding dates with chunk citations, and priority focus items.
3. "key_terms": Defined terms with meaning in context of this document.
4. "clauses": Major clauses with what it says and why inspect.
5. "issues": Descriptive observations of one-sided terms, ambiguities, or missing standards. Never risk scores.`;

type OwnedDocument = {
  id: string;
  title: string;
  status: string;
  user_id?: string;
  overview?: unknown;
  key_terms?: unknown;
  clauses?: unknown;
  issues?: unknown;
  file_name?: string;
  page_count?: number | null;
  status_detail?: string | null;
  error_message?: string | null;
};

export async function getOwnedDocument(
  supabaseClient: SupabaseClient<Database>,
  documentId: string,
  userId: string,
) {
  const { data, error } = await supabaseClient
    .from("documents")
    .select(
      "id, title, status, user_id, overview, key_terms, clauses, issues, file_name, page_count, status_detail, error_message",
    )
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("That document could not be found.");
  }

  return data;
}

const ANSWER_INSTRUCTIONS = `You are SELA, answering a question about ONE legal document using only the numbered passages provided.
Rules:
1. Primary Answer ("FROM YOUR DOCUMENT"): Ground every statement in the provided passages. Never invent law or facts.
2. If passages do not contain enough information to answer completely, set sufficient to false and explain what is missing.
3. Citations ("citations"): List the exact Passage IDs (integers, e.g. [0, 4]) of every passage you directly referenced or relied on. Every factual claim MUST cite at least one Passage ID from the provided passages. Never return an empty citations array if you extracted answers from the passages.
4. Follow-up Questions ("follow_ups"): Generate 2 to 4 genuinely useful, specific follow-up questions directly related to this question and document to help the user investigate further. Never generate generic conversational filler.`;

/** Normalize whitespace for near-duplicate passage detection. */
export function normalizePassageText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(" ").filter(Boolean));
}

/** Jaccard similarity over whitespace-normalized tokens. */
export function passageJaccard(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function isNearDuplicate(candidate: string, kept: string[]): boolean {
  for (const prev of kept) {
    if (prev === candidate) return true;
    if (prev.includes(candidate) || candidate.includes(prev)) {
      const shorter = Math.min(prev.length, candidate.length);
      const longer = Math.max(prev.length, candidate.length);
      if (longer > 0 && shorter / longer >= 0.85) return true;
    }
    if (passageJaccard(prev, candidate) >= 0.9) return true;
  }
  return false;
}

/**
 * Build numbered passage context for the model.
 * Prefer higher-ranked matches (caller order), skip near-duplicates, respect char budget.
 */
export function buildContext(
  chunks: Array<{ chunk_index: number; page_number: number; content: string }>,
  charBudget: number,
) {
  let used = 0;
  const parts: string[] = [];
  const keptNormalized: string[] = [];
  for (const chunk of chunks) {
    const normalized = normalizePassageText(chunk.content);
    if (!normalized) continue;
    if (isNearDuplicate(normalized, keptNormalized)) continue;
    const block = `[Passage ID: ${chunk.chunk_index} | Page ${chunk.page_number}]\n${chunk.content}`;
    if (used + block.length > charBudget) break;
    parts.push(block);
    keptNormalized.push(normalized);
    used += block.length;
  }
  return parts.join("\n\n");
}

/** Resolve Ask research mode from client flags. */
export function resolveAskSearchMode(input: {
  verifyExternal?: boolean | undefined;
  searchMode?: "document" | "both" | "external" | undefined;
}): "document" | "both" | "external" {
  if (input.searchMode === "external") return "external";
  if (input.verifyExternal || input.searchMode === "both") return "both";
  return "document";
}

/** External research runs only for both/external scopes — never document-only. */
export function askNeedsExternalResearch(mode: "document" | "both" | "external"): boolean {
  return mode === "both" || mode === "external";
}

export const ASK_CONTEXT_CHAR_BUDGET = 45000;
export const PROCESS_CONTEXT_CHAR_BUDGET = 70000;

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ProcessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("./rate-limit");
    assertRateLimit(userId, "process");

    const { embedTexts, generateStructured } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const doc = await getOwnedDocument(supabase, data.documentId, userId);

    const dbClient = supabaseAdmin ?? supabase;

    const fail = async (message: string) => {
      await dbClient
        .from("documents")
        .update({
          status: "failed",
          status_detail: "Could not prepare this document",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.documentId);
    };

    try {
      const initialChunks = await supabase
        .from("document_chunks")
        .select("id, chunk_index, page_number, content, embedding")
        .eq("document_id", data.documentId)
        .order("chunk_index", { ascending: true });
      if (initialChunks.error) throw new Error(initialChunks.error.message);
      let chunks = initialChunks.data;

      // Server-owned extract path: if no chunks yet, download original and extract.
      if (!chunks || chunks.length === 0) {
        const { data: fullDoc, error: fullErr } = await supabase
          .from("documents")
          .select("storage_path, file_name, mime_type")
          .eq("id", data.documentId)
          .eq("user_id", userId)
          .single();
        if (fullErr || !fullDoc?.storage_path) {
          throw new Error("No readable text was found in this document.");
        }

        await dbClient
          .from("documents")
          .update({ status: "preparing", status_detail: "Extracting text from the document" })
          .eq("id", data.documentId);

        const { data: fileBlob, error: downloadError } = await dbClient.storage
          .from("documents")
          .download(fullDoc.storage_path);
        if (downloadError || !fileBlob) {
          throw new Error(downloadError?.message ?? "Could not download the uploaded document.");
        }

        // Size-aware: byteLength is known before parse; avoid retaining blob + buffer together.
        let buffer: ArrayBuffer | null = await fileBlob.arrayBuffer();
        const { extractAndChunkFromBuffer } = await import("./extract-text.server");
        let extracted;
        let built;
        try {
          const result = await extractAndChunkFromBuffer({
            buffer,
            fileName: fullDoc.file_name,
            mimeType: fullDoc.mime_type,
          });
          extracted = result.extracted;
          built = result.chunks;
        } finally {
          buffer = null;
        }
        if (built.length === 0) {
          throw new Error("No selectable text was found — SELA cannot read scanned images yet.");
        }

        const rows = built.map((chunk) => ({
          document_id: data.documentId,
          user_id: userId,
          chunk_index: chunk.chunkIndex,
          page_number: chunk.page,
          content: chunk.content,
        }));
        for (let i = 0; i < rows.length; i += 100) {
          const { error } = await dbClient.from("document_chunks").insert(rows.slice(i, i + 100));
          if (error) throw new Error(error.message);
        }

        await dbClient
          .from("documents")
          .update({
            page_count: extracted.pageCount,
            status_detail: "Reading the document",
          })
          .eq("id", data.documentId);

        const reloaded = await supabase
          .from("document_chunks")
          .select("id, chunk_index, page_number, content, embedding")
          .eq("document_id", data.documentId)
          .order("chunk_index", { ascending: true });
        if (reloaded.error) throw new Error(reloaded.error.message);
        chunks = reloaded.data;
      }

      if (!chunks || chunks.length === 0) {
        throw new Error("No readable text was found in this document.");
      }

      await dbClient
        .from("documents")
        .update({ status: "preparing", status_detail: "Reading the document" })
        .eq("id", data.documentId);

      const allEmbedded = chunks.every(
        (c) => typeof c.embedding === "string" && c.embedding.length > 2,
      );

      if (!allEmbedded) {
        const embeddings = await embedTexts(chunks.map((c) => c.content));
        const rows = chunks.map((chunk, index) => ({
          id: chunk.id,
          document_id: data.documentId,
          user_id: userId,
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[index]),
        }));
        for (let i = 0; i < rows.length; i += 40) {
          const { error } = await dbClient.from("document_chunks").upsert(rows.slice(i, i + 40));
          if (error) throw new Error(error.message);
        }
      }

      await dbClient
        .from("documents")
        .update({ status_detail: "Reviewing SELA'S VERSION & structured intelligence" })
        .eq("id", data.documentId);

      const analysis = await generateStructured<Analysis>({
        instructions: ANALYSIS_INSTRUCTIONS,
        input: `Document title: ${doc.title}\n\n${buildContext(chunks, PROCESS_CONTEXT_CHAR_BUDGET)}`,
        schemaName: "document_analysis",
        schema: analysisSchema,
        effort: "medium",
      });

      // Attach sela_version inside overview / clauses payload so it persists without schema breakage
      const enrichedOverview = {
        ...analysis.overview,
        sela_version: analysis.sela_version,
      };

      const { error: saveError } = await dbClient
        .from("documents")
        .update({
          overview: enrichedOverview,
          key_terms: analysis.key_terms,
          clauses: analysis.clauses,
          issues: analysis.issues,
          status: "ready",
          status_detail: "Ready for review",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.documentId);
      if (saveError) throw new Error(saveError.message);

      return { ok: true as const };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SELA could not prepare this document.";
      await fail(message);
      throw new Error(message);
    }
  });

export const askDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("./rate-limit");
    assertRateLimit(userId, "ask");

    const { embedTexts, generateStructured, verifyExternalSources } = await import("./ai.server");

    const doc = await getOwnedDocument(supabase, data.documentId, userId);
    if (doc.status !== "ready") throw new Error("This document is still being prepared.");

    const mode = resolveAskSearchMode({
      verifyExternal: data.verifyExternal,
      searchMode: data.searchMode,
    });

    let result = {
      sufficient: true,
      answer: "",
      citations: [] as number[],
      follow_ups: [] as string[],
    };
    let cited: Array<{ chunkIndex: number; page: number; excerpt: string }> = [];
    let externalVerification: {
      status: "CONSISTENT" | "DIFFERS" | "NOT FOUND" | "NEEDS CONTEXT" | "UNAVAILABLE";
      summary: string;
      how_they_relate?: string;
      sources: Array<{ title: string; url: string; published_date?: string }>;
    } | null = null;

    if (mode === "document" || mode === "both") {
      const [questionEmbedding] = await embedTexts([data.question]);
      const { data: matches, error: matchError } = await supabase.rpc("match_document_chunks", {
        p_document_id: data.documentId,
        p_query_embedding: JSON.stringify(questionEmbedding),
        p_match_count: 10,
      });
      if (matchError) throw new Error(matchError.message);

      const passages = (matches ?? []).map((m) => ({
        chunk_index: m.chunk_index,
        page_number: m.page_number,
        content: m.content,
      }));

      // Ensure initial preamble passages are present
      const hasPreamble = passages.some((p) => p.chunk_index === 0 || p.chunk_index === 1);
      if (!hasPreamble) {
        const { data: introChunks } = await supabase
          .from("document_chunks")
          .select("chunk_index, page_number, content")
          .eq("document_id", data.documentId)
          .in("chunk_index", [0, 1])
          .order("chunk_index", { ascending: true });
        if (introChunks && introChunks.length > 0) {
          passages.unshift(...introChunks);
        }
      }

      if (passages.length === 0) {
        result = {
          sufficient: false,
          answer:
            "This document does not contain passages that address your question, so SELA cannot answer it from the document.",
          citations: [],
          follow_ups: [
            "Which section of the document covers this topic?",
            "What are the general obligations specified in this agreement?",
          ],
        };
      } else {
        result = await generateStructured({
          instructions: ANSWER_INSTRUCTIONS,
          input: `Document title: ${doc.title}\n\nQuestion: ${data.question}\n\nPassages:\n\n${buildContext(
            passages,
            ASK_CONTEXT_CHAR_BUDGET,
          )}`,
          schemaName: "document_answer",
          schema: answerSchema,
          effort: "low",
          maxTokens: 1536,
        });
      }

      cited = result.citations
        .map((index) => passages.find((p) => p.chunk_index === index))
        .filter((p): p is (typeof passages)[number] => Boolean(p))
        .map((p) => ({
          chunkIndex: p.chunk_index,
          page: p.page_number,
          excerpt: p.content.length > 900 ? `${p.content.slice(0, 900)}…` : p.content,
        }));
    }

    // Document-only Ask never calls external research (fail-closed grounding stays local).
    if (askNeedsExternalResearch(mode)) {
      externalVerification = await verifyExternalSources({
        question: data.question,
        documentAnswer: result.answer || undefined,
        documentTitle: doc.title,
      });

      if (mode === "external") {
        result.answer =
          externalVerification.status === "UNAVAILABLE"
            ? "SELA could not complete the external source check right now."
            : externalVerification.summary;
        result.sufficient = externalVerification.status !== "UNAVAILABLE";
        result.follow_ups = [
          "What specific statutes govern this matter in this jurisdiction?",
          "How do standard industry legal practices handle this issue?",
          "Are there relevant court precedents or regulatory advisories?",
        ];
      } else if (mode === "both" && externalVerification.how_they_relate) {
        result.follow_ups = [
          ...result.follow_ups,
          "Does public regulation require terms beyond what this agreement states?",
          "How do legal authorities treat discrepancies with standard terms?",
        ].slice(0, 4);
      }
    }

    const citationsPayload = {
      list: cited,
      external_verification: externalVerification,
      follow_ups: result.follow_ups || [],
      mode,
    };

    const { data: saved, error: saveError } = await supabase
      .from("document_questions")
      .insert({
        document_id: data.documentId,
        user_id: userId,
        question: data.question,
        answer: result.answer,
        citations: citationsPayload,
        sufficient: result.sufficient && (mode === "external" || cited.length > 0),
      })
      .select("id, question, answer, sufficient, created_at")
      .single();
    if (saveError) throw new Error(saveError.message);

    return {
      ...saved,
      citations: cited,
      follow_ups: result.follow_ups || [],
      external_verification: externalVerification,
      mode,
    };
  });

export const explainWithSela = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseExplainInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("./rate-limit");
    assertRateLimit(userId, "explain");

    const { generateStructured, translateExplanatoryFieldsBatch } = await import("./ai.server");

    const doc = await getOwnedDocument(supabase, data.documentId, userId);
    void doc;

    let textToExplain = data.text || "";
    let pageNum = 1;
    const chunkIdx = data.chunkIndex || 0;

    if (data.chunkIndex !== undefined) {
      const { data: chunk } = await supabase
        .from("document_chunks")
        .select("content, page_number")
        .eq("document_id", data.documentId)
        .eq("chunk_index", data.chunkIndex)
        .single();
      if (!chunk) throw new Error("That source passage could not be found.");
      textToExplain = chunk.content;
      pageNum = chunk.page_number;
    }

    if (!textToExplain) {
      throw new Error("No passage text provided to explain.");
    }

    const explainSchema = obj({
      section_title: { type: "string" },
      what_it_says: { type: "string" },
      why_it_matters: { type: "string" },
      who_it_affects: { type: "string" },
      what_happens: { type: "string" },
      important_dates: { type: "string" },
      visual: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "timeline",
              "obligation_flow",
              "responsibility_map",
              "process_flow",
              "clause_relationship",
              "decision_tree",
              "key_dates",
            ],
          },
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                detail: { type: "string" },
                step: { type: "integer" },
              },
              required: ["label"],
            },
          },
        },
        required: ["type", "title", "items"],
      },
    });

    const explanation = await generateStructured<
      Omit<SelaVersionSection, "chunk_index" | "page_number">
    >({
      instructions: `You are SELA. Explain this specific legal passage faithfully and clearly.
Preserve all conditions, obligations, deadlines, and parties.
CRITICAL FIDELITY RULES:
- Every field must be strictly grounded in this passage.
- If a field (e.g. who_it_affects, what_happens, important_dates) is not specified or supported in this passage, omit it.
- NEVER invent generic filler such as "Operates according to standard contract terms".
Output structured breakdown: section_title, what_it_says, why_it_matters, who_it_affects, what_happens, important_dates, visual diagram.`,
      input: textToExplain,
      schemaName: "passage_explanation",
      schema: explainSchema,
      effort: "low",
      maxTokens: 1536,
    });

    // Translate if requested in non-English — single batched model call (not per-field).
    let translated = explanation;
    if (data.language && data.language !== "en") {
      const batch = await translateExplanatoryFieldsBatch({
        fields: {
          section_title: explanation.section_title,
          what_it_says: explanation.what_it_says,
          ...(explanation.why_it_matters ? { why_it_matters: explanation.why_it_matters } : {}),
          ...(explanation.who_it_affects ? { who_it_affects: explanation.who_it_affects } : {}),
          ...(explanation.what_happens ? { what_happens: explanation.what_happens } : {}),
          ...(explanation.important_dates ? { important_dates: explanation.important_dates } : {}),
        },
        targetLanguage: data.language,
      });
      translated = {
        ...explanation,
        section_title: batch.section_title || explanation.section_title,
        what_it_says: batch.what_it_says,
        ...(batch.why_it_matters ? { why_it_matters: batch.why_it_matters } : {}),
        ...(batch.who_it_affects ? { who_it_affects: batch.who_it_affects } : {}),
        ...(batch.what_happens ? { what_happens: batch.what_happens } : {}),
        ...(batch.important_dates ? { important_dates: batch.important_dates } : {}),
      };
    }

    return {
      ...translated,
      chunk_index: chunkIdx,
      page_number: pageNum,
    };
  });

export const translateSelaVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseTranslateInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("./rate-limit");
    assertRateLimit(userId, "translate");

    const { translateSelaVersionBatch } = await import("./ai.server");

    await getOwnedDocument(supabase, data.documentId, userId);

    if (data.targetLanguage === "en" || !data.sections || data.sections.length === 0) {
      return { sections: data.sections || [] };
    }

    // Check if translation is already cached in documents table
    const { data: doc } = await supabase
      .from("documents")
      .select("overview")
      .eq("id", data.documentId)
      .single();

    const overview = (doc?.overview as Record<string, unknown> | null) || {};
    const cachedTranslations =
      (overview["translations"] as Record<string, SelaVersionSection[]> | undefined) || {};
    const cachedList = cachedTranslations[data.targetLanguage];
    if (cachedList && cachedList.length > 0) {
      return { sections: cachedList };
    }

    // Build batch payload
    const itemsToTranslate = data.sections.map((s: SelaVersionSection, idx: number) => ({
      section_index: idx,
      section_title: s.section_title,
      what_it_says: s.what_it_says,
      ...(s.why_it_matters ? { why_it_matters: s.why_it_matters } : {}),
      ...(s.who_it_affects ? { who_it_affects: s.who_it_affects } : {}),
      ...(s.what_happens ? { what_happens: s.what_happens } : {}),
      ...(s.important_dates ? { important_dates: s.important_dates } : {}),
    }));

    const translatedResults = await translateSelaVersionBatch({
      items: itemsToTranslate,
      targetLanguage: data.targetLanguage,
    });

    const resultMap = new Map(translatedResults.map((r) => [r.section_index, r]));

    const translatedSections: SelaVersionSection[] = data.sections.map(
      (sec: SelaVersionSection, idx: number) => {
        const trans = resultMap.get(idx);
        return {
          ...sec,
          section_title: trans?.section_title || sec.section_title,
          what_it_says: trans?.what_it_says || sec.what_it_says,
          ...(trans?.why_it_matters
            ? { why_it_matters: trans.why_it_matters }
            : sec.why_it_matters
              ? { why_it_matters: sec.why_it_matters }
              : {}),
          ...(trans?.who_it_affects
            ? { who_it_affects: trans.who_it_affects }
            : sec.who_it_affects
              ? { who_it_affects: sec.who_it_affects }
              : {}),
          ...(trans?.what_happens
            ? { what_happens: trans.what_happens }
            : sec.what_happens
              ? { what_happens: sec.what_happens }
              : {}),
          ...(trans?.important_dates
            ? { important_dates: trans.important_dates }
            : sec.important_dates
              ? { important_dates: sec.important_dates }
              : {}),
        };
      },
    );

    // Persist translation to document overview cache in background
    const updatedOverview = {
      ...overview,
      translations: {
        ...cachedTranslations,
        [data.targetLanguage]: translatedSections,
      },
    };
    await supabase
      .from("documents")
      .update({ overview: updatedOverview })
      .eq("id", data.documentId);

    return { sections: translatedSections };
  });
