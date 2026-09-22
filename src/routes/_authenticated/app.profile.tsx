import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/sela/profile-page";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile · SELA" },
      { name: "description", content: "Your SELA account details." },
    ],
  }),
  component: ProfilePage,
});
