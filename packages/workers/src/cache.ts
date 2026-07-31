import type { Env } from "./types";

const DEFAULT_CACHE_TTL = 60;

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

export function slugCacheKey(slug: string): string {
  return `slug:${slug.toLowerCase()}`;
}

export function cacheKey(orgId: string, segment: string, path: string): string {
  return `${orgId}:${segment}:${path}`;
}
