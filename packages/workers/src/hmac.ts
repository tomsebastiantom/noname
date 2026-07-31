import type { Env } from "./types";

let cachedHmacKey: CryptoKey | null = null;
let cachedHmacSecret: string | null = null;

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (cachedHmacKey && cachedHmacSecret === secret) {
    return cachedHmacKey;
  }
  cachedHmacSecret = secret;
  cachedHmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedHmacKey;
}

export async function hmacHeaders(
  orgId: string,
  userId: string,
  role: string,
  env: Env,
): Promise<Record<string, string>> {
  const payload = `${orgId}:${userId}:${role}`;
  const key = await getHmacKey(env.WORKER_SERVER_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = btoa(String.fromCodePoint(...new Uint8Array(signature)));

  return {
    "x-org-id": orgId,
    "x-user-id": userId,
    "x-role": role,
    "x-auth-hmac": hmac,
  };
}
