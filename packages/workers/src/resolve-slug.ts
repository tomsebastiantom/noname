import { fetchWithTimeout } from "@noname/auth";
import { storeSlugFromHost } from "@noname/shared";
import { getCached, isMiss, setCache, setMissCache, slugCacheKey } from "./cache";
import { hmacHeaders } from "./hmac";
import type { Env } from "./types";

const SLUG_CACHE_TTL = 300;

export { storeSlugFromHost };

/** Resolve store slug to org id — KV cache, then API. Negative-caches misses 60s. */
export async function resolveSiteId(env: Env, siteId: string): Promise<string | null> {
  const slug = siteId.trim().toLowerCase();
  if (!slug) return null;

  const cached = await getCached<{ orgId: string }>(env, slugCacheKey(slug));
  if (cached?.orgId) return cached.orgId;
  if (isMiss(cached)) return null;

  // Upstream orgMiddleware rejects unsigned calls when WORKER_SERVER_SECRET is set —
  // internal edge→API service calls must carry the same HMAC the proxy adds.
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${env.API_ORIGIN}/api/tenants/resolve/${encodeURIComponent(slug)}`,
      { headers: await hmacHeaders("", "", "", env) },
    );
  } catch (error) {
    // An origin outage must never throw out of the worker — an unguarded await
    // here previously killed the wrangler dev process outright. Deliberately do
    // NOT negative-cache: a transient outage must be retried on the next request
    // rather than serving a stale miss for the whole miss-cache window.
    console.warn(`[resolve-slug] ${slug} upstream unreachable — not caching, will retry`, error);
    return null;
  }
  if (!res.ok) {
    // Only a definitive "no such slug" is worth negative-caching. An origin
    // outage (5xx) previously poisoned the cache for the whole miss window, so a
    // brief API restart turned into ~60s of 400s for a perfectly valid tenant.
    if (res.status === 404) {
      await setMissCache(env, slugCacheKey(slug));
      return null;
    }
    console.warn(`[resolve-slug] ${slug} upstream ${res.status} — not caching, will retry`);
    return null;
  }

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
