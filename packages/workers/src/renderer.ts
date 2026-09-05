import { cacheKey, getCached, setCache } from "./cache";
import { hmacHeaders } from "./hmac";
import type { Env } from "./types";

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
