import { Link } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";
import type { ReactNode } from "react";

const links = [
  { to: "/", label: "Clock station" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/employees", label: "Employees" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary scan-glow">
              <Fingerprint className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-semibold tracking-tight">
                ClockPrint
              </span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Biometric attendance
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full border border-border/70 bg-secondary/50 p-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                activeOptions={{ exact: l.to === "/" }}
                className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
