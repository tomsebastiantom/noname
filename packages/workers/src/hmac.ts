import type { Env } from "./types";

export async function hmacHeaders(
  orgId: string,
  userId: string,
  role: string,
  env: Env,
): Promise<Record<string, string>> {
  const payload = `${orgId}:${userId}:${role}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WORKER_SERVER_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = btoa(String.fromCodePoint(...new Uint8Array(signature)));

  return {
    "x-org-id": orgId,
    "x-user-id": userId,
    "x-role": role,
    "x-auth-hmac": hmac,
  };
}
