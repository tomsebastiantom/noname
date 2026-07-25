/** ZITADEL org id from subdomain, e.g. 383371762538184712.localhost → that org */
export function orgIdFromHostname(hostname: string): string | null {
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

export function requireOrgId(): string {
  const orgId = orgIdFromHostname(window.location.hostname);
  if (!orgId) {
    throw new Error("Missing org subdomain — use {orgId}.localhost:5173");
  }
  return orgId;
}
