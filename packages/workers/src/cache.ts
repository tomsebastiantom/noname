import type { Env } from "./types";

const DEFAULT_CACHE_TTL = 60;
const _PERSONALIZED_CACHE_TTL = 60;
const _STATIC_CACHE_TTL = 300;

export async function getCached<T>(env: Env, key: string): Promise<T | null> {
  const cached = await env.KV.get(key, "json");
  return cached as T | null;
}

export async function setCache(
  env: Env,
  key: string,
  value: unknown,
  ttl: number = DEFAULT_CACHE_TTL,
): Promise<void> {
  await env.KV.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

export function cacheKey(tenantId: string, segment: string, path: string): string {
  return `${tenantId}:${segment}:${path}`;
}

export function staticCacheKey(path: string): string {
  return `static:${path}`;
}
