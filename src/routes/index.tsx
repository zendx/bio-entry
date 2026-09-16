import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, LogIn, LogOut, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { startScan, finishScan, getDashboard, type ClockResult } from "@/lib/clocking.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClockPrint — Fingerprint Clock-In Station" },
      {
        name: "description",
        content:
          "Staff touch the sensor once to record arrival or departure. No cards, no passwords, no queues.",
      },
      { property: "og:title", content: "ClockPrint — Fingerprint Clock-In Station" },
      {
        property: "og:description",
        content: "Touch the sensor to clock in or out. Biometric office attendance in one second.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClockStation,
});

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ClockStation() {
  const now = useNow();
  const begin = useServerFn(startScan);
  const complete = useServerFn(finishScan);
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ClockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
    refetchInterval: 20_000,
  });

  const scan = useMutation({
    mutationFn: async () => {
      const origin = window.location.origin;
      const options = await begin({ data: { origin } });
      const response = await startAuthentication({ optionsJSON: options as never });
      return complete({ data: { origin, response } });
    },
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setTimeout(() => setResult(null), 12_000);
    },
    onError: (e: unknown) => {
      const raw = e instanceof Error ? e.message : String(e);
      setError(
        /NotAllowedError|abort|timed out/i.test(raw)
          ? "Scan cancelled or timed out. Place your finger on the sensor and try again."
          : raw,
      );
    },
  });

  const scanning = scan.isPending;

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="panel relative overflow-hidden p-8 sm:p-12">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary">Clock station</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                Touch the sensor to record your time
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                One touch is all it takes. The system recognises who you are and whether you are
                arriving or leaving.
              </p>
            </div>
            <div className="text-right">
              <p className="mono-num text-3xl font-semibold sm:text-4xl">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {now.toLocaleDateString([], {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center">
            <button
              type="button"
              onClick={() => scan.mutate()}
              disabled={scanning}
              aria-label="Scan fingerprint"
              className="group relative grid size-48 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-transform hover:scale-[1.03] disabled:cursor-progress sm:size-56"
            >
              {scanning && (
                <>
                  <span className="absolute inset-0 rounded-full border border-primary/50 animate-pulse-ring" />
                  <span className="absolute inset-x-8 top-1/2 h-16 -translate-y-1/2 overflow-hidden rounded-full">
                    <span className="block h-px w-full bg-primary animate-scan-sweep" />
                  </span>
                </>
              )}
              <Fingerprint className="size-24 sm:size-28" strokeWidth={1.1} />
            </button>
            <p className="mt-6 text-sm text-muted-foreground">
              {scanning ? "Reading fingerprint…" : "Tap the print, then use your fingerprint sensor"}
            </p>
          </div>

          {result && (
            <div
              className={`mt-8 flex items-center gap-4 rounded-xl border p-4 ${
                result.event_type === "in"
                  ? "border-success/40 bg-success/10"
                  : "border-warning/40 bg-warning/10"
              }`}
            >
              {result.employee.photo_url ? (
                <img
                  src={result.employee.photo_url}
                  alt={result.employee.full_name}
                  className="size-16 rounded-lg object-cover"
                />
              ) : (
                <span className="grid size-16 place-items-center rounded-lg bg-secondary font-display text-xl">
                  {result.employee.full_name.charAt(0)}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">{result.employee.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {result.employee.job_title ?? result.employee.employee_code} ·{" "}
                  {result.status === "duplicate"
                    ? "already recorded a moment ago"
                    : result.event_type === "in"
                      ? "clocked in"
                      : "clocked out"}{" "}
                  at{" "}
                  <span className="mono-num">
                    {new Date(result.occurred_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              </div>
              {result.event_type === "in" ? (
                <LogIn className="ml-auto size-7 text-success" />
              ) : (
                <LogOut className="ml-auto size-7 text-warning" />
              )}
            </div>
          )}

          {error && (
            <div className="mt-8 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Not recorded</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <div className="panel p-6">
            <h2 className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              In the office now
            </h2>
            <p className="mono-num mt-3 text-5xl font-semibold text-primary">
              {feed.data?.stats.present_now ?? "–"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              of {feed.data?.stats.active_employees ?? 0} active employees
            </p>
          </div>

          <div className="panel flex-1 p-6">
            <h2 className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Latest activity
            </h2>
            <ul className="mt-4 space-y-3">
              {(feed.data?.recent ?? []).slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{e.full_name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                        e.event_type === "in"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {e.event_type}
                    </span>
                    <span className="mono-num text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </li>
              ))}
              {feed.data && feed.data.recent.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No one has clocked in yet this week.
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
