import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Fingerprint, TrendingUp, UserCheck, Users } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getDashboard } from "@/lib/clocking.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Attendance Dashboard — ClockPrint" },
      {
        name: "description",
        content:
          "Live attendance overview: who is in the office, arrival times, lateness and hours worked today.",
      },
      { property: "og:title", content: "Attendance Dashboard — ClockPrint" },
      {
        property: "og:description",
        content: "Live attendance overview with arrivals, lateness and hours worked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function fmtTime(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(mins: number) {
  if (!mins) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
    refetchInterval: 20_000,
  });

  const stats = data?.stats;
  const maxWeek = Math.max(1, ...(data?.week ?? []).map((w) => w.count));

  const cards = [
    { label: "Present now", value: stats?.present_now ?? 0, icon: UserCheck, accent: "text-primary" },
    { label: "Clocked in today", value: stats?.clocked_in_today ?? 0, icon: Clock, accent: "text-foreground" },
    { label: "Late arrivals", value: stats?.late_today ?? 0, icon: TrendingUp, accent: "text-warning" },
    { label: "Employees", value: stats?.total_employees ?? 0, icon: Users, accent: "text-foreground" },
    {
      label: "Fingerprints enrolled",
      value: stats?.enrolled_fingerprints ?? 0,
      icon: Fingerprint,
      accent: "text-primary",
    },
  ];

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold">Attendance dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live for {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
            {stats?.avg_arrival ? ` · average arrival ${stats.avg_arrival}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {c.label}
              </span>
              <c.icon className={`size-4 ${c.accent}`} />
            </div>
            <p className={`mono-num mt-3 text-3xl font-semibold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/70 px-6 py-4">
            <h2 className="font-display text-lg font-semibold">Today's register</h2>
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${data?.today.length ?? 0} employees`}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-3 py-3 font-medium">First in</th>
                  <th className="px-3 py-3 font-medium">Last out</th>
                  <th className="px-3 py-3 font-medium">Hours</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.today ?? []).map((row) => (
                  <tr key={row.employee_id} className="border-t border-border/50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {row.photo_url ? (
                          <img
                            src={row.photo_url}
                            alt={row.full_name}
                            className="size-9 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="grid size-9 place-items-center rounded-lg bg-secondary text-xs">
                            {row.full_name.charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.full_name}</p>
                          <p className="mono-num text-xs text-muted-foreground">
                            {row.employee_code}
                            {row.department ? ` · ${row.department}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="mono-num px-3 py-3">
                      {fmtTime(row.first_in)}
                      {row.late && (
                        <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] uppercase text-warning">
                          late
                        </span>
                      )}
                    </td>
                    <td className="mono-num px-3 py-3">{fmtTime(row.last_out)}</td>
                    <td className="mono-num px-3 py-3">{fmtHours(row.minutes_worked)}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                          row.status === "present"
                            ? "bg-success/15 text-success"
                            : row.status === "left"
                              ? "bg-secondary text-muted-foreground"
                              : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {data && data.today.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                      No employees registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold">Attendance this week</h2>
            <ul className="mt-5 space-y-3">
              {(data?.week ?? []).map((w) => (
                <li key={w.day} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-muted-foreground">{w.day}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(w.count / maxWeek) * 100}%` }}
                    />
                  </span>
                  <span className="mono-num w-6 text-right">{w.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel flex-1 p-6">
            <h2 className="font-display text-lg font-semibold">Recent punches</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {(data?.recent ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{e.full_name}</span>
                    <span className="mono-num text-xs text-muted-foreground">
                      {e.employee_code}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase ${
                        e.event_type === "in"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {e.event_type}
                    </span>
                    <span className="mono-num text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString([], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </li>
              ))}
              {data && data.recent.length === 0 && (
                <li className="text-muted-foreground">Nothing recorded in the last 7 days.</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
