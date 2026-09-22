import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/home")({
  beforeLoad: () => {
    throw redirect({ to: "/app/home" });
  },
  component: () => null,
});
