import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Trash2, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  createEmployee,
  deleteEmployee,
  finishEnrollment,
  listEmployees,
  removeFingerprints,
  setEmployeeActive,
  startEnrollment,
} from "@/lib/clocking.functions";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Register Employees — ClockPrint" },
      {
        name: "description",
        content:
          "Add staff with photo, address, phone and role, then enrol the fingerprint that identifies them at the clock station.",
      },
      { property: "og:title", content: "Register Employees — ClockPrint" },
      {
        property: "og:description",
        content: "Add staff details and enrol the fingerprint used to clock in and out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Employees;
});

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  address: "",
  job_title: "",
  department: "",
  date_of_birth: "",
};

function field(label: string, node: React.ReactNode) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {node}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring";

function Employees() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const employees = useQuery({ queryKey: ["employees"], queryFn: () => listEmployees() });

  const create = useServerFn(createEmployee);
  const beginEnroll = useServerFn(startEnrollment);
  const completeEnroll = useServerFn(finishEnrollment);
  const removePrints = useServerFn(removeFingerprints);
  const toggleActive = useServerFn(setEmployeeActive);
  const remove = useServerFn(deleteEmployee);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const enroll = useMutation({
    mutationFn: async (employeeId: string) => {
      const origin = window.location.origin;
      const options = await beginEnroll({ data: { employee_id: employeeId, origin } });
      const response = await startRegistration({ optionsJSON: options as never });
      return completeEnroll({
        data: {
          employee_id: employeeId,
          origin,
          response,
          device_label: navigator.platform || "Sensor",
        },
      });
    },
    onSuccess: () => {
      toast.success("Fingerprint enrolled. This employee can now clock in.");
      refresh();
    },
    onError: (e: unknown) => {
      const raw = e instanceof Error ? e.message : String(e);
      toast.error(
        /NotAllowedError|abort|timed out/i.test(raw)
          ? "Enrolment cancelled. Try again and hold the finger on the sensor."
          : /InvalidStateError/i.test(raw)
            ? "This finger is already registered for this employee."
            : raw,
      );
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (form.full_name.trim().length < 2) throw new Error("Please enter the full name.");
      return create({ data: { ...form, photo_data_url: photo ?? "" } });
    },
    onSuccess: (row) => {
      toast.success(`${row.full_name} added as ${row.employee_code}. Enrol a fingerprint next.`);
      setForm(emptyForm);
      setPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save employee"),
  });

  function onPhoto(file: File | undefined) {
    if (!file) return setPhoto(null);
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Please choose a picture smaller than 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <section className="panel h-fit p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary">Registration</p>
          <h1 className="mt-2 text-2xl font-semibold">Add a new employee</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture their details first, then enrol the fingerprint so the clock station recognises
            them.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div className="flex items-center gap-4">
              {photo ? (
                <img src={photo} alt="Selected employee" className="size-20 rounded-xl object-cover" />
              ) : (
                <span className="grid size-20 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                  Photo
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:text-foreground"
              />
            </div>

            {field(
              "Full name *",
              <input
                className={inputClass}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Amaka Chukwu"
                maxLength={120}
                required
              />,
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {field(
                "Job title",
                <input
                  className={inputClass}
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder="Accountant"
                  maxLength={120}
                />,
              )}
              {field(
                "Department",
                <input
                  className={inputClass}
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Finance"
                  maxLength={120}
                />,
              )}
              {field(
                "Phone number",
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+234 800 000 0000"
                  maxLength={40}
                />,
              )}
              {field(
                "Email",
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@company.com"
                  maxLength={200}
                />,
              )}
              {field(
                "Date of birth",
                <input
                  className={inputClass}
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />,
              )}
            </div>

            {field(
              "Home address",
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="12 Marina Road, Lagos Island"
                maxLength={400}
              />,
            )}

            <button
              type="submit"
              disabled={submit.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <UserPlus className="size-4" />
              {submit.isPending ? "Saving…" : "Save employee"}
            </button>
          </form>
        </section>

        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/70 px-6 py-4">
            <h2 className="font-display text-lg font-semibold">Employee directory</h2>
            <span className="text-xs text-muted-foreground">
              {employees.isLoading ? "Loading…" : `${employees.data?.length ?? 0} people`}
            </span>
          </header>

          <ul className="divide-y divide-border/60">
            {(employees.data ?? []).map((emp) => (
              <li key={emp.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                {emp.photo_url ? (
                  <img src={emp.photo_url} alt={emp.full_name} className="size-12 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-lg bg-secondary font-display">
                    {emp.full_name.charAt(0)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{emp.full_name}</span>
                    {!emp.is_active && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="mono-num text-xs text-muted-foreground">
                    {emp.employee_code}
                    {emp.job_title ? ` · ${emp.job_title}` : ""}
                    {emp.phone ? ` · ${emp.phone}` : ""}
                  </p>
                  {emp.address && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{emp.address}</p>
                  )}
                  <p className="mt-1 text-xs">
                    {emp.fingerprint_count > 0 ? (
                      <span className="text-primary">
                        {emp.fingerprint_count} fingerprint{emp.fingerprint_count > 1 ? "s" : ""}{" "}
                        enrolled
                      </span>
                    ) : (
                      <span className="text-warning">No fingerprint yet</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => enroll.mutate(emp.id)}
                    disabled={enroll.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
                  >
                    <Fingerprint className="size-4" />
                    {emp.fingerprint_count > 0 ? "Add finger" : "Enrol fingerprint"}
                  </button>
                  {emp.fingerprint_count > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await removePrints({ data: { employee_id: emp.id } });
                        toast.success("Fingerprints cleared.");
                        refresh();
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await toggleActive({ data: { id: emp.id, is_active: !emp.is_active } });
                      refresh();
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {emp.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${emp.full_name}`}
                    onClick={async () => {
                      if (!confirm(`Delete ${emp.full_name} and all their records?`)) return;
                      await remove({ data: { id: emp.id } });
                      toast.success("Employee deleted.");
                      refresh();
                    }}
                    className="rounded-lg border border-destructive/40 p-2 text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
            {employees.data && employees.data.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-muted-foreground">
                No employees yet. Add the first one on the left.
              </li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
