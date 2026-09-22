import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // If hash based or already has session
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            throw new Error("No authorization code or active session found.");
          }
        }
        navigate({ to: "/app/home", replace: true });
      } catch (err) {
        console.error("Auth callback error:", err);
        setErrorMsg(err instanceof Error ? err.message : "Authentication failed.");
      }
    }

    void handleAuthCallback();
  }, [navigate]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="paper-panel max-w-md p-8 text-center">
          <h1 className="font-display text-2xl text-foreground">Sign in error</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
          <a
            href="/auth"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-brass" /> Completing sign in…
      </div>
    </div>
  );
}
