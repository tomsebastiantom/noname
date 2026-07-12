import type { Env } from "./types";
import { getCached, setCache, cacheKey } from "./cache";

export function isBot(request: Request): boolean {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const botPatterns = [
    "googlebot",
    "bingbot",
    "slurp",
    "duckduckbot",
    "baiduspider",
    "yandexbot",
    "facebot",
    "twitterbot",
    "applebot",
    "linkedinbot",
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
    const response = await fetch(url, {
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": userId,
        "x-role": role,
      },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { data: Record<string, unknown> };
    const schema = data.data;

    if (schema) {
      await setCache(env, key, schema, 300);
    }

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
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    const url = `${env.API_ORIGIN}/api/edge/personalize`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
        "x-user-id": userId,
        "x-role": role,
      },
      body: JSON.stringify({
        siteId: tenantId,
        headers,
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { data: Record<string, unknown> };
    return data.data;
  } catch {
    return null;
  }
}
