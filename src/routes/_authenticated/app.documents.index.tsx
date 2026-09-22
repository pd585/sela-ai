import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/routes/_authenticated/workspace";

export const Route = createFileRoute("/_authenticated/app/documents/")({
  head: () => ({
    meta: [
      { title: "Your documents · SELA" },
      {
        name: "description",
        content: "Upload a contract or legal document and open it for review with SELA.",
      },
      { property: "og:title", content: "Your documents · SELA" },
      {
        property: "og:description",
        content: "Upload a contract or legal document and open it for review with SELA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});
