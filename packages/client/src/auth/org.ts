let cached: { key: string; orgId: string } | null = null;

/** First subdomain label — store slug. */
export function storeSlugFromHostname(hostname: string): string | null {
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

export function requireStoreSlug(): string {
  const slug = storeSlugFromHostname(window.location.hostname);
  if (!slug) {
    throw new Error("Missing store subdomain — use {slug}.localhost:5173");
  }
  return slug;
}

/** Resolve hostname subdomain to ZITADEL org id via store slug lookup. */
export async function resolveOrgIdFromHostname(hostname: string): Promise<string | null> {
  const sub = storeSlugFromHostname(hostname);
  if (!sub) return null;

  if (cached?.key === sub) return cached.orgId;

  const res = await fetch(`/api/tenants/resolve/${encodeURIComponent(sub)}`);
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: { orgId?: string } };
  const orgId = body.data?.orgId ?? null;
  if (orgId) cached = { key: sub, orgId };
  return orgId;
}

export async function requireOrgId(): Promise<string> {
  const orgId = await resolveOrgIdFromHostname(window.location.hostname);
  if (!orgId) {
    throw new Error("Missing store subdomain — use {slug}.localhost:5173");
  }
  return orgId;
}
