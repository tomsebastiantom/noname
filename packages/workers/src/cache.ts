import type { Env } from "./types";

const DEFAULT_CACHE_TTL = 60;
const MISS_CACHE_TTL = 60;

const memCache = new Map<string, { value: unknown; expiresAt: number }>();

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

function normalizePath(path: string): string {
  return path.trim().toLowerCase().replace(/\/+$/g, "") || "/";
}

function withJitter(ttl: number): number {
  const jitter = Math.floor(Math.random() * Math.min(30, Math.max(5, ttl * 0.1)));
  return ttl + jitter;
}

export async function getCached<T>(env: Env, key: string): Promise<T | null> {
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.value as T | null;
  if (mem) memCache.delete(key);
  try {
    const cached = await env.KV.get(key, "json");
    return cached as T | null;
  } catch (err) {
    console.warn(`[cache] KV.get ${key} failed`, err);
    return null;
  }
}

export async function setCache(
  env: Env,
  key: string,
  value: unknown,
  ttl: number = DEFAULT_CACHE_TTL,
): Promise<void> {
  memCache.set(key, { value, expiresAt: Date.now() + withJitter(ttl) * 1000 });
  try {
    await env.KV.put(key, JSON.stringify(value), { expirationTtl: withJitter(ttl) });
  } catch (err) {
    console.warn(`[cache] KV.put ${key} failed`, err);
  }
}

export async function setMissCache(env: Env, key: string): Promise<void> {
  await setCache(env, key, { __miss: true }, MISS_CACHE_TTL);
}

export function isMiss<T>(value: T | null): boolean {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).__miss === true;
}

export function slugCacheKey(slug: string): string {
  return `slug:${normalizeSlug(slug)}`;
}

export function cacheKey(orgId: string, segment: string, path: string): string {
  return `${normalizeSlug(orgId)}:${normalizeSlug(segment)}:${normalizePath(path)}`;
}
