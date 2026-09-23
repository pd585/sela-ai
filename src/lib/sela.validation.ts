import { z } from "zod";

const language = z.enum(["en", "te", "hi", "ml", "kn"]);

const visual = z
  .object({
    type: z.enum([
      "timeline",
      "obligation_flow",
      "responsibility_map",
      "process_flow",
      "clause_relationship",
      "decision_tree",
      "key_dates",
    ]),
    title: z.string().min(1).max(400),
    items: z
      .array(
        z
          .object({
            label: z.string().min(1).max(1000),
            detail: z.string().min(1).max(4000).optional(),
            step: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

const translatedSection = z
  .object({
    section_title: z.string().min(1).max(400),
    chunk_index: z.number().int().nonnegative(),
    page_number: z.number().int().positive(),
    what_it_says: z.string().min(1).max(6000),
    why_it_matters: z.string().min(1).max(4000).optional(),
    who_it_affects: z.string().min(1).max(4000).optional(),
    what_happens: z.string().min(1).max(4000).optional(),
    important_dates: z.string().min(1).max(4000).optional(),
    visual: visual.optional(),
  })
  .strict();

const translateInput = z
  .object({
    documentId: z.string().uuid(),
    targetLanguage: language,
    sections: z.array(translatedSection).max(60).optional(),
  })
  .superRefine((value, context) => {
    const totalCharacters = (value.sections ?? []).reduce(
      (total, section) => total + JSON.stringify(section).length,
      0,
    );
    if (totalCharacters > 90_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The selected sections are too large to translate safely in one request.",
        path: ["sections"],
      });
    }
  });

const explainInput = z.object({
  documentId: z.string().uuid(),
  chunkIndex: z.number().int().optional(),
  text: z.string().max(12000).optional(),
  language: language.optional().default("en"),
});

export function parseExplainInput(input: unknown) {
  return explainInput.parse(input);
}

export function parseTranslateInput(input: unknown) {
  return translateInput.parse(input);
}
