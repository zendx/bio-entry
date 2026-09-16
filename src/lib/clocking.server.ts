import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const db = supabaseAdmin as any;

export const PHOTO_BUCKET = "employee-photos";

export function resolveRp(rawOrigin: string) {
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error("Invalid origin");
  }
  return { rpID: url.hostname, expectedOrigin: url.origin };
}

export async function storeChallenge(
  challenge: string,
  purpose: string,
  employeeId?: string | null,
) {
  await db.from("auth_challenges").delete().lt("expires_at", new Date().toISOString());
  const { error } = await db
    .from("auth_challenges")
    .insert({ challenge, purpose, employee_id: employeeId ?? null });
  if (error) throw new Error(error.message);
}

export async function consumeChallenge(challenge: string, purpose: string) {
  const { data, error } = await db
    .from("auth_challenges")
    .select("*")
    .eq("challenge", challenge)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This scan session expired. Please try again.");
  await db.from("auth_challenges").delete().eq("id", data.id);
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("This scan session expired. Please try again.");
  }
  return data;
}

export async function signPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 8);
  return data?.signedUrl ?? null;
}

export async function signPhotos(paths: (string | null)[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  await Promise.all(
    unique.map(async (p) => {
      const url = await signPhoto(p);
      if (url) map.set(p, url);
    }),
  );
  return map;
}

export async function uploadPhoto(dataUrl: string, employeeCode: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported image format");
  const contentType = match[1]!;
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Image is larger than 8MB");
  const ext = contentType.split("/")[1]!.replace("jpeg", "jpg");
  const path = `${employeeCode}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function nextEmployeeCode() {
  const { data } = await db
    .from("employees")
    .select("employee_code")
    .order("created_at", { ascending: false })
    .limit(200);
  let max = 0;
  for (const row of data ?? []) {
    const n = Number(String(row.employee_code).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}
