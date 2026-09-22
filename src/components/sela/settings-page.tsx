import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/sela/shell";

export function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Account</p>
        <h1 className="mt-2 font-display text-5xl">Settings</h1>
        <p className="mt-4 text-base text-muted-foreground">Your supported workspace settings.</p>
        <section className="paper-panel mt-10 flex gap-4 p-6">
          <ShieldCheck className="mt-1 size-5 shrink-0 text-brass" />
          <div>
            <h2 className="font-display text-2xl">Private workspace</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your documents and source passages remain scoped to your authenticated account.
              Account actions, including sign out, are available from the account menu.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
