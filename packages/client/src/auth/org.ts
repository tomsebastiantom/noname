import { storeSlugFromHost } from "@noname/shared";
import { apiFetchOptional } from "../lib/api";

let cached: { key: string; orgId: string } | null = null;

export function requireStoreSlug(): string {
  const slug = storeSlugFromHost(window.location.hostname);
  if (!slug) {
    throw new Error("Missing store subdomain — use {slug}.localhost:5173");
  }
  return slug;
}

/** Resolve hostname subdomain to ZITADEL org id via store slug lookup. */
export async function resolveOrgIdFromHostname(hostname: string): Promise<string | null> {
  const sub = storeSlugFromHost(hostname);
  if (!sub) return null;

  if (cached?.key === sub) return cached.orgId;

  try {
    const body = await apiFetchOptional<{ data?: { orgId?: string } }>(
      `/api/tenants/resolve/${encodeURIComponent(sub)}`,
    );
    const orgId = body?.data?.orgId ?? null;
    if (orgId) cached = { key: sub, orgId };
    return orgId;
  } catch {
    return null;
  }
}

export async function requireOrgId(): Promise<string> {
  const orgId = await resolveOrgIdFromHostname(window.location.hostname);
  if (!orgId) {
    throw new Error("Missing store subdomain — use {slug}.localhost:5173");
  }
  return orgId;
}
