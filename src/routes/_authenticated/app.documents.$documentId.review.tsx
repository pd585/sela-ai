import { createFileRoute } from "@tanstack/react-router";
import { DocumentReview } from "@/routes/_authenticated/documents.$documentId";

export const Route = createFileRoute("/_authenticated/app/documents/$documentId/review")({
  head: () => ({
    meta: [
      { title: "Document review · SELA" },
      {
        name: "description",
        content:
          "Read the overview, key terms, clauses and observations for your document, and ask questions answered from the text itself.",
      },
      { property: "og:title", content: "Document review · SELA" },
      {
        property: "og:description",
        content:
          "Read the overview, key terms, clauses and observations for your document, and ask questions answered from the text itself.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentReview,
});
