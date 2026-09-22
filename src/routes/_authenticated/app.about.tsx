import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/routes/_authenticated/about";

export const Route = createFileRoute("/_authenticated/app/about")({
  head: () => ({
    meta: [
      { title: "About SELA · SELA" },
      {
        name: "description",
        content: "Learn what SELA does and what it can and cannot do.",
      },
    ],
  }),
  component: AboutPage,
});
