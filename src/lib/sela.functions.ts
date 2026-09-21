import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProcessInput = z.object({ documentId: z.string().uuid() });
const AskInput = z.object({
  documentId: z.string().uuid(),
  question: z.string().min(3).max(1000),
});

export type Citation = { chunkIndex: number; page: number; excerpt: string };

export type DocumentOverview = {
  document_type: string;
  purpose: string;
  summary: string;
  parties: string[];
  dates: Array<{ label: string; detail: string; chunk_index: number }>;
  what_matters_first: string[];
};
export type KeyTerm = { term: string; meaning_in_document: string; chunk_index: number };
export type ClauseFinding = {
  title: string;
  what_it_says: string;
  why_inspect: string;
  chunk_index: number;
};
export type IssueFinding = { title: string; observation: string; chunk_index: number };

type Analysis = {
  overview: DocumentOverview;
  key_terms: KeyTerm[];
  clauses: ClauseFinding[];
  issues: IssueFinding[];
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
});

const answerSchema = obj({
  sufficient: { type: "boolean" },
  answer: { type: "string" },
  citations: { type: "array", items: { type: "integer" } },
});

const ANALYSIS_INSTRUCTIONS = `You are SELA, a careful legal-document reading assistant.
You are given numbered passages from ONE document. Work only from those passages.
Rules:
- Never invent parties, dates, clauses, laws, or quotations. If the document does not say it, leave it out.
- Write in plain language a non-lawyer can follow. No legal advice, no verdicts, no scores.
- Every finding must cite the passage number it came from in chunk_index.
- "issues" are descriptive observations worth inspecting (unusual, one-sided, open-ended, missing or ambiguous information), never risk ratings.
- If the document is short or thin, return fewer items rather than padding.
- Aim for up to 10 key terms, up to 10 clauses, and up to 8 issues.`;

const ANSWER_INSTRUCTIONS = `You are SELA, answering a question about ONE legal document using only the numbered passages provided.
Rules:
- Answer only from the passages. Never invent text, clauses, dates, parties or law.
- If the passages do not support an answer, set sufficient to false and say plainly that the document does not provide enough to answer, naming what is missing.
- Plain language. No legal advice or final determinations.
- List the passage numbers you relied on in citations.`;

function buildContext(
  chunks: Array<{ chunk_index: number; page_number: number; content: string }>,
  charBudget: number,
) {
  let used = 0;
  const parts: string[] = [];
  for (const chunk of chunks) {
    const block = `[passage ${chunk.chunk_index} | page ${chunk.page_number}]\n${chunk.content}`;
    if (used + block.length > charBudget) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ProcessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { embedTexts, generateStructured } = await import("./ai.server");

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, title, status")
      .eq("id", data.documentId)
      .single();
    if (docError || !doc) throw new Error("That document could not be found.");

    const fail = async (message: string) => {
      await supabase
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
      const { data: chunks, error: chunkError } = await supabase
        .from("document_chunks")
        .select("id, chunk_index, page_number, content")
        .eq("document_id", data.documentId)
        .order("chunk_index", { ascending: true });
      if (chunkError) throw new Error(chunkError.message);
      if (!chunks || chunks.length === 0)
        throw new Error("No readable text was found in this document.");

      await supabase
        .from("documents")
        .update({ status: "preparing", status_detail: "Reading the document" })
        .eq("id", data.documentId);

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
        const { error } = await supabase.from("document_chunks").upsert(rows.slice(i, i + 40));
        if (error) throw new Error(error.message);
      }

      await supabase
        .from("documents")
        .update({ status_detail: "Reviewing the document" })
        .eq("id", data.documentId);

      const analysis = await generateStructured<Analysis>({
        instructions: ANALYSIS_INSTRUCTIONS,
        input: `Document title: ${doc.title}\n\n${buildContext(chunks, 90000)}`,
        schemaName: "document_analysis",
        schema: analysisSchema,
        effort: "medium",
      });

      const { error: saveError } = await supabase
        .from("documents")
        .update({
          overview: analysis.overview,
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
    const { embedTexts, generateStructured } = await import("./ai.server");

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, title, status")
      .eq("id", data.documentId)
      .single();
    if (docError || !doc) throw new Error("That document could not be found.");
    if (doc.status !== "ready") throw new Error("This document is still being prepared.");

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

    let result: { sufficient: boolean; answer: string; citations: number[] };
    if (passages.length === 0) {
      result = {
        sufficient: false,
        answer:
          "This document does not contain passages that address your question, so SELA cannot answer it from the document.",
        citations: [],
      };
    } else {
      result = await generateStructured({
        instructions: ANSWER_INSTRUCTIONS,
        input: `Document title: ${doc.title}\n\nQuestion: ${data.question}\n\nPassages:\n\n${buildContext(
          passages,
          60000,
        )}`,
        schemaName: "document_answer",
        schema: answerSchema,
        effort: "low",
      });
    }

    const cited = result.citations
      .map((index) => passages.find((p) => p.chunk_index === index))
      .filter((p): p is (typeof passages)[number] => Boolean(p))
      .map((p) => ({
        chunkIndex: p.chunk_index,
        page: p.page_number,
        excerpt: p.content.length > 900 ? `${p.content.slice(0, 900)}…` : p.content,
      }));

    const { data: saved, error: saveError } = await supabase
      .from("document_questions")
      .insert({
        document_id: data.documentId,
        user_id: userId,
        question: data.question,
        answer: result.answer,
        citations: cited,
        sufficient: result.sufficient && cited.length > 0,
      })
      .select("id, question, answer, citations, sufficient, created_at")
      .single();
    if (saveError) throw new Error(saveError.message);

    return saved;
  });
