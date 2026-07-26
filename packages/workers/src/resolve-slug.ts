import { getCached, setCache, slugCacheKey } from "./cache";
import type { Env } from "./types";

const SLUG_CACHE_TTL = 300;

export function storeSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0]?.trim() ?? "";
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

/** Resolve store slug to org id — KV cache, then API. */
export async function resolveSiteId(env: Env, siteId: string): Promise<string | null> {
  const slug = siteId.trim().toLowerCase();
  if (!slug) return null;

  const cached = await getCached<{ orgId: string }>(env, slugCacheKey(slug));
  if (cached?.orgId) return cached.orgId;

  const res = await fetch(`${env.API_ORIGIN}/api/tenants/resolve/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: { orgId?: string } };
  const orgId = body.data?.orgId ?? null;
  if (orgId) {
    await setCache(env, slugCacheKey(slug), { orgId }, SLUG_CACHE_TTL);
  }
  return orgId;
}

export async function resolveOrgIdFromHost(env: Env, host: string): Promise<string | null> {
  const slug = storeSlugFromHost(host);
  if (!slug) return null;
  return resolveSiteId(env, slug);
}
