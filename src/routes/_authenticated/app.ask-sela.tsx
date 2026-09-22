import { createFileRoute } from "@tanstack/react-router";
import { AskSelaPage } from "@/components/sela/ask-sela-page";

export const Route = createFileRoute("/_authenticated/app/ask-sela")({
  head: () => ({
    meta: [
      { title: "Ask SELA · SELA" },
      {
        name: "description",
        content:
          "Ask a question about one of your legal documents and receive grounded answers with citations.",
      },
    ],
  }),
  component: AskSelaPage,
});
