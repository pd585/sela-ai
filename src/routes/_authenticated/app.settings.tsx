import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/sela/settings-page";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · SELA" },
      { name: "description", content: "Your supported workspace settings." },
    ],
  }),
  component: SettingsPage,
});
