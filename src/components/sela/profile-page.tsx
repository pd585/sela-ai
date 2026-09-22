import { useQuery } from "@tanstack/react-query";
import { Mail, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/sela/shell";

export function ProfilePage() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      return data.user;
    },
  });
  const metadata = user?.user_metadata;
  const provider =
    user?.app_metadata?.provider ??
    (user?.app_metadata?.providers as string[] | undefined)?.[0] ??
    "Email";
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Account</p>
        <h1 className="mt-2 font-display text-5xl">Profile</h1>
        <p className="mt-4 text-base text-muted-foreground">Your account details.</p>
        <section className="paper-panel mt-10 divide-y divide-border">
          <div className="flex items-center gap-4 p-6">
            <UserRound className="size-5 text-brass" />
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Name</p>
              <p className="mt-1 text-base">
                {isLoading
                  ? "Loading..."
                  : (metadata?.["full_name"] ?? metadata?.["name"] ?? "Not provided")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-6">
            <Mail className="size-5 text-brass" />
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Email</p>
              <p className="mt-1 text-base">{user?.email ?? "Not available"}</p>
            </div>
          </div>
          <div className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Authentication method
            </p>
            <p className="mt-1 text-base capitalize">{provider}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
