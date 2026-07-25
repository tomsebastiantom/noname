import { cacheKey, getCached, setCache } from "./cache";
import { hmacHeaders } from "./hmac";
import type { Env } from "./types";

export { hmacHeaders };

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
  orgId: string,
  segment: string,
  env: Env,
  userId = "",
  role = "",
): Promise<Record<string, unknown> | null> {
  const key = cacheKey(orgId, segment, `schema:${orgId}`);
  const cached = await getCached<Record<string, unknown>>(env, key);
  if (cached) return cached;

  try {
    const url = `${env.API_ORIGIN}/api/edge/schema/${orgId}?segment=${segment}`;
    const headers = await hmacHeaders(orgId, userId, role, env);
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
  orgId: string,
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
      ...(await hmacHeaders(orgId, userId, role, env)),
    };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ siteId: orgId, headers: reqHeaders }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { data: Record<string, unknown> };
    return data.data;
  } catch {
    return null;
  }
}
