import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";
import { FileText, Home, Info, LogOut, MessageSquareText, UserRound, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>
      SELA is a review aid, not a lawyer. It does not give legal advice or make final legal
      determinations — for consequential decisions, speak to a qualified professional.
    </p>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-border bg-sidebar lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-6 py-5 lg:block">
          <Link to="/app/home" className="block">
            <span className="font-display text-2xl tracking-tight">SELA</span>
            <span className="mt-1 block text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              Legal document intelligence
            </span>
          </Link>
          <AccountMenu compact signOut={signOut} />
        </div>

        <nav className="grid grid-cols-2 gap-1 px-4 pb-4 sm:grid-cols-4 lg:block lg:space-y-6 lg:px-4 lg:py-6">
          <NavGroup label="My desk">
            <NavItem to="/app/home" icon={Home} active={location.pathname === "/app/home"}>
              Home
            </NavItem>
            <NavItem
              to="/app/documents"
              icon={FileText}
              active={location.pathname === "/app/documents"}
            >
              Documents
            </NavItem>
          </NavGroup>
          <NavGroup label="Review">
            <NavItem
              to="/app/ask-sela"
              icon={MessageSquareText}
              active={location.pathname === "/app/ask-sela"}
            >
              Ask SELA
            </NavItem>
            <NavItem
              to="/app/review"
              icon={FileText}
              active={location.pathname === "/app/review" || location.pathname.includes("/review")}
            >
              Review
            </NavItem>
          </NavGroup>
          <NavGroup label="Account">
            <NavItem
              to="/app/profile"
              icon={UserRound}
              active={location.pathname === "/app/profile"}
            >
              Profile
            </NavItem>
            <NavItem
              to="/app/settings"
              icon={Settings}
              active={location.pathname === "/app/settings"}
            >
              Settings
            </NavItem>
            <NavItem to="/app/about" icon={Info} active={location.pathname === "/app/about"}>
              About SELA
            </NavItem>
          </NavGroup>
        </nav>

        <div className="hidden px-6 pb-6 lg:block">
          <AccountMenu signOut={signOut} />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-col">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <Disclaimer />
          </div>
        </footer>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 hidden px-3 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:block">
        {label}
      </p>
      <div className="grid gap-1 sm:grid-cols-1">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  active,
  children,
}: {
  to:
    | "/app/home"
    | "/app/documents"
    | "/app/ask-sela"
    | "/app/review"
    | "/app/profile"
    | "/app/settings"
    | "/app/about";
  icon: typeof Home;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span>{children}</span>
    </Link>
  );
}

function AccountMenu({ compact = false, signOut }: { compact?: boolean; signOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={compact ? "lg:hidden" : "w-full justify-start gap-2"}
          aria-label="Account menu"
        >
          <UserRound className="size-4" />
          {!compact && <span>Account</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "right"}>
        <DropdownMenuItem asChild>
          <Link to="/app/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
