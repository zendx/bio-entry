import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type EmployeeRecord = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  job_title: string | null;
  department: string | null;
  date_of_birth: string | null;
  is_active: boolean;
  created_at: string;
  photo_url: string | null;
  fingerprint_count: number;
  last_event: { event_type: string; occurred_at: string } | null;
};

const employeeInput = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  date_of_birth: z.string().trim().max(20).optional().or(z.literal("")),
  photo_data_url: z.string().max(12_000_000).optional().or(z.literal("")),
});

const blank = (v?: string) => (v && v.length > 0 ? v : null);

export const listEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { db, signPhotos } = await import("./clocking.server");
  const { data: employees, error } = await db
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (employees ?? []).map((e: any) => e.id);
  const [{ data: prints }, { data: events }] = await Promise.all([
    db.from("fingerprints").select("employee_id"),
    db
      .from("attendance_events")
      .select("employee_id, event_type, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(2000),
  ]);

  const printCount = new Map<string, number>();
  for (const p of prints ?? []) printCount.set(p.employee_id, (printCount.get(p.employee_id) ?? 0) + 1);
  const lastEvent = new Map<string, { event_type: string; occurred_at: string }>();
  for (const e of events ?? []) {
    if (!lastEvent.has(e.employee_id)) lastEvent.set(e.employee_id, e);
  }

  const photoMap = await signPhotos((employees ?? []).map((e: any) => e.photo_path));

  return (employees ?? []).map((e: any): EmployeeRecord => ({
    id: e.id,
    employee_code: e.employee_code,
    full_name: e.full_name,
    email: e.email,
    phone: e.phone,
    address: e.address,
    job_title: e.job_title,
    department: e.department,
    date_of_birth: e.date_of_birth,
    is_active: e.is_active,
    created_at: e.created_at,
    photo_url: e.photo_path ? (photoMap.get(e.photo_path) ?? null) : null,
    fingerprint_count: printCount.get(e.id) ?? 0,
    last_event: lastEvent.get(e.id) ?? null,
  }));
});

export const createEmployee = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => employeeInput.parse(data))
  .handler(async ({ data }) => {
    const { db, nextEmployeeCode, uploadPhoto } = await import("./clocking.server");
    const code = await nextEmployeeCode();
    let photoPath: string | null = null;
    if (data.photo_data_url) photoPath = await uploadPhoto(data.photo_data_url, code);

    const { data: row, error } = await db
      .from("employees")
      .insert({
        employee_code: code,
        full_name: data.full_name,
        email: blank(data.email),
        phone: blank(data.phone),
        address: blank(data.address),
        job_title: blank(data.job_title),
        department: blank(data.department),
        date_of_birth: blank(data.date_of_birth),
        photo_path: photoPath,
      })
      .select("id, employee_code, full_name")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; employee_code: string; full_name: string };
  });

export const setEmployeeActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./clocking.server");
    const { error } = await db.from("employees").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./clocking.server");
    const { error } = await db.from("employees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- fingerprint enrolment ---------------- */

export const startEnrollment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ employee_id: z.string().uuid(), origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const { db, resolveRp, storeChallenge } = await import("./clocking.server");
    const { rpID } = resolveRp(data.origin);

    const { data: emp, error } = await db
      .from("employees")
      .select("id, full_name, employee_code")
      .eq("id", data.employee_id)
      .single();
    if (error || !emp) throw new Error("Employee not found");

    const { data: existing } = await db
      .from("fingerprints")
      .select("credential_id, transports")
      .eq("employee_id", emp.id);

    const options = await generateRegistrationOptions({
      rpName: "ClockPrint Attendance",
      rpID,
      userID: new TextEncoder().encode(emp.id),
      userName: `${emp.employee_code} · ${emp.full_name}`,
      userDisplayName: emp.full_name,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      excludeCredentials: (existing ?? []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ?? undefined,
      })),
    });

    await storeChallenge(options.challenge, "enroll", emp.id);
    return JSON.parse(JSON.stringify(options)) as Record<string, unknown>;
  });

export const finishEnrollment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        employee_id: z.string().uuid(),
        origin: z.string().url(),
        device_label: z.string().max(120).optional(),
        response: z.any(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const { db, resolveRp, consumeChallenge } = await import("./clocking.server");
    const { rpID, expectedOrigin } = resolveRp(data.origin);

    const clientChallenge = JSON.parse(
      Buffer.from(data.response.response.clientDataJSON, "base64").toString("utf8"),
    ).challenge as string;
    await consumeChallenge(clientChallenge, "enroll");

    const verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge: clientChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Fingerprint could not be verified");
    }
    const cred = verification.registrationInfo.credential;
    const { error } = await db.from("fingerprints").insert({
      employee_id: data.employee_id,
      credential_id: cred.id,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ?? null,
      device_label: data.device_label ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFingerprints = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ employee_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./clocking.server");
    const { error } = await db.from("fingerprints").delete().eq("employee_id", data.employee_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- clocking ---------------- */

export const startScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const { resolveRp, storeChallenge } = await import("./clocking.server");
    const { rpID } = resolveRp(data.origin);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    await storeChallenge(options.challenge, "scan", null);
    return JSON.parse(JSON.stringify(options)) as Record<string, unknown>;
  });

export type ClockResult = {
  status: "clocked" | "duplicate";
  event_type: "in" | "out";
  occurred_at: string;
  employee: { id: string; full_name: string; employee_code: string; job_title: string | null; photo_url: string | null };
};

export const finishScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ origin: z.string().url(), response: z.any() }).parse(d))
  .handler(async ({ data }): Promise<ClockResult> => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const { db, resolveRp, consumeChallenge, signPhoto } = await import("./clocking.server");
    const { rpID, expectedOrigin } = resolveRp(data.origin);

    const clientChallenge = JSON.parse(
      Buffer.from(data.response.response.clientDataJSON, "base64").toString("utf8"),
    ).challenge as string;
    await consumeChallenge(clientChallenge, "scan");

    const { data: cred } = await db
      .from("fingerprints")
      .select("*")
      .eq("credential_id", data.response.id)
      .maybeSingle();
    if (!cred) throw new Error("This fingerprint is not registered yet.");

    const verification = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge: clientChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: isoBase64URL.toBuffer(cred.public_key),
        counter: Number(cred.counter),
        transports: cred.transports ?? undefined,
      },
    });
    if (!verification.verified) throw new Error("Fingerprint did not match");

    await db
      .from("fingerprints")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);

    const { data: emp } = await db
      .from("employees")
      .select("id, full_name, employee_code, job_title, photo_path, is_active")
      .eq("id", cred.employee_id)
      .single();
    if (!emp) throw new Error("Employee record missing");
    if (!emp.is_active) throw new Error(`${emp.full_name} is not an active employee.`);

    const photo_url = await signPhoto(emp.photo_path);
    const employee = {
      id: emp.id,
      full_name: emp.full_name,
      employee_code: emp.employee_code,
      job_title: emp.job_title,
      photo_url,
    };

    const { data: last } = await db
      .from("attendance_events")
      .select("event_type, occurred_at")
      .eq("employee_id", emp.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last && Date.now() - new Date(last.occurred_at).getTime() < 60_000) {
      return {
        status: "duplicate",
        event_type: last.event_type as "in" | "out",
        occurred_at: last.occurred_at,
        employee,
      };
    }

    const eventType: "in" | "out" = last?.event_type === "in" ? "out" : "in";
    const occurredAt = new Date().toISOString();
    const { error } = await db.from("attendance_events").insert({
      employee_id: emp.id,
      event_type: eventType,
      occurred_at: occurredAt,
      method: "fingerprint",
    });
    if (error) throw new Error(error.message);

    return { status: "clocked", event_type: eventType, occurred_at: occurredAt, employee };
  });

/* ---------------- dashboard ---------------- */

export type DashboardData = {
  stats: {
    total_employees: number;
    active_employees: number;
    enrolled_fingerprints: number;
    present_now: number;
    clocked_in_today: number;
    late_today: number;
    avg_arrival: string | null;
  };
  today: {
    employee_id: string;
    full_name: string;
    employee_code: string;
    department: string | null;
    photo_url: string | null;
    first_in: string | null;
    last_out: string | null;
    status: "present" | "left" | "absent";
    minutes_worked: number;
    late: boolean;
  }[];
  recent: {
    id: string;
    full_name: string;
    employee_code: string;
    event_type: string;
    occurred_at: string;
  }[];
  week: { day: string; count: number }[];
};

const LATE_AFTER_MINUTES = 9 * 60; // 09:00

export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData> => {
    const { db, signPhotos } = await import("./clocking.server");
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekStart = new Date(startOfToday.getTime() - 6 * 86_400_000);

    const [{ data: employees }, { data: prints }, { data: weekEvents }] = await Promise.all([
      db.from("employees").select("*").order("full_name"),
      db.from("fingerprints").select("id"),
      db
        .from("attendance_events")
        .select("id, employee_id, event_type, occurred_at")
        .gte("occurred_at", weekStart.toISOString())
        .order("occurred_at", { ascending: true }),
    ]);

    const empList = employees ?? [];
    const byId = new Map<string, any>(empList.map((e: any) => [e.id, e]));
    const photoMap = await signPhotos(empList.map((e: any) => e.photo_path));

    const todayEvents = (weekEvents ?? []).filter(
      (e: any) => new Date(e.occurred_at) >= startOfToday,
    );

    const perEmployee = new Map<string, any[]>();
    for (const e of todayEvents) {
      const list = perEmployee.get(e.employee_id) ?? [];
      list.push(e);
      perEmployee.set(e.employee_id, list);
    }

    let presentNow = 0;
    let lateToday = 0;
    const arrivalMinutes: number[] = [];

    const today = empList.map((emp: any) => {
      const events = perEmployee.get(emp.id) ?? [];
      const firstIn = events.find((e) => e.event_type === "in")?.occurred_at ?? null;
      const outs = events.filter((e) => e.event_type === "out");
      const lastOut = outs.length ? outs[outs.length - 1]!.occurred_at : null;
      const latest = events.length ? events[events.length - 1] : null;
      const status: "present" | "left" | "absent" = !latest
        ? "absent"
        : latest.event_type === "in"
          ? "present"
          : "left";
      if (status === "present") presentNow += 1;

      let minutes = 0;
      let openedAt: number | null = null;
      for (const e of events) {
        if (e.event_type === "in") openedAt = new Date(e.occurred_at).getTime();
        else if (openedAt) {
          minutes += (new Date(e.occurred_at).getTime() - openedAt) / 60_000;
          openedAt = null;
        }
      }
      if (openedAt) minutes += (Date.now() - openedAt) / 60_000;

      let late = false;
      if (firstIn) {
        const d = new Date(firstIn);
        const mins = d.getHours() * 60 + d.getMinutes();
        arrivalMinutes.push(mins);
        late = mins > LATE_AFTER_MINUTES;
        if (late) lateToday += 1;
      }

      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        employee_code: emp.employee_code,
        department: emp.department,
        photo_url: emp.photo_path ? (photoMap.get(emp.photo_path) ?? null) : null,
        first_in: firstIn,
        last_out: lastOut,
        status,
        minutes_worked: Math.round(minutes),
        late,
      };
    });

    const avg =
      arrivalMinutes.length > 0
        ? Math.round(arrivalMinutes.reduce((a, b) => a + b, 0) / arrivalMinutes.length)
        : null;

    const week: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(startOfToday.getTime() - i * 86_400_000);
      const next = new Date(day.getTime() + 86_400_000);
      const ids = new Set(
        (weekEvents ?? [])
          .filter(
            (e: any) =>
              e.event_type === "in" &&
              new Date(e.occurred_at) >= day &&
              new Date(e.occurred_at) < next,
          )
          .map((e: any) => e.employee_id),
      );
      week.push({
        day: day.toLocaleDateString(undefined, { weekday: "short" }),
        count: ids.size,
      });
    }

    const recent = [...(weekEvents ?? [])]
      .reverse()
      .slice(0, 15)
      .map((e: any) => ({
        id: e.id,
        full_name: byId.get(e.employee_id)?.full_name ?? "Unknown",
        employee_code: byId.get(e.employee_id)?.employee_code ?? "—",
        event_type: e.event_type,
        occurred_at: e.occurred_at,
      }));

    return {
      stats: {
        total_employees: empList.length,
        active_employees: empList.filter((e: any) => e.is_active).length,
        enrolled_fingerprints: (prints ?? []).length,
        present_now: presentNow,
        clocked_in_today: today.filter((t: { first_in: string | null }) => t.first_in).length,
        late_today: lateToday,
        avg_arrival:
          avg === null
            ? null
            : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      },
      today,
      recent,
      week,
    };
  },
);
