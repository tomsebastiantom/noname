import type { Env } from "./types";
import { getCached, setCache, cacheKey } from "./cache";

async function hmacHeaders(tenantId: string, userId: string, role: string, env: Env): Promise<Record<string, string>> {
  const payload = `${tenantId}:${userId}:${role}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WORKER_SERVER_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return {
    "x-tenant-id": tenantId,
    "x-user-id": userId,
    "x-role": role,
    "x-auth-hmac": hmac,
  };
}

export function isBot(request: Request): boolean {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const botPatterns = [
    "googlebot", "bingbot", "slurp", "duckduckbot",
    "baiduspider", "yandexbot", "facebot", "twitterbot",
    "applebot", "linkedinbot",
  ];
  return botPatterns.some((p) => ua.includes(p));
}

export async function fetchSchema(
  tenantId: string,
  segment: string,
  env: Env,
  userId = "",
  role = "",
): Promise<Record<string, unknown> | null> {
  const key = cacheKey(tenantId, segment, `schema:${tenantId}`);
  const cached = await getCached<Record<string, unknown>>(env, key);
  if (cached) return cached;

  try {
    const url = `${env.API_ORIGIN}/api/edge/schema/${tenantId}?segment=${segment}`;
    const headers = await hmacHeaders(tenantId, userId, role, env);
    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const data = (await response.json()) as { data: Record<string, unknown> };
    const schema = data.data;

    if (schema) await setCache(env, key, schema, 300);
    return schema;
  } catch {
    return null;
  }
}

export async function personalizeSchema(
  tenantId: string,
  request: Request,
  env: Env,
  userId = "",
  role = "",
): Promise<Record<string, unknown> | null> {
  const reqHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    reqHeaders[key] = value;
  });

  try {
    const url = `${env.API_ORIGIN}/api/edge/personalize`;
    const headers = {
      "Content-Type": "application/json",
      ...(await hmacHeaders(tenantId, userId, role, env)),
    };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ siteId: tenantId, headers: reqHeaders }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { data: Record<string, unknown> };
    return data.data;
  } catch {
    return null;
  }
}
