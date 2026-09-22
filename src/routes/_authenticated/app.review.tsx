import { createFileRoute } from "@tanstack/react-router";
import { ReviewPage } from "@/components/sela/review-page";

export const Route = createFileRoute("/_authenticated/app/review")({
  head: () => ({
    meta: [
      { title: "Review · SELA" },
      {
        name: "description",
        content: "Return to your active legal document reviews in SELA.",
      },
    ],
  }),
  component: ReviewPage,
});
