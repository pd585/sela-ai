import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/sela/home-page";

export const Route = createFileRoute("/_authenticated/app/home")({
  head: () => ({
    meta: [
      { title: "Home · SELA" },
      {
        name: "description",
        content:
          "Your legal document intelligence workspace. Upload documents, ask grounded questions, and review contracts.",
      },
      { property: "og:title", content: "Home · SELA" },
      {
        property: "og:description",
        content:
          "Your legal document intelligence workspace. Upload documents, ask grounded questions, and review contracts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});
