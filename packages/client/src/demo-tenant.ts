/** Keep in sync with scripts/seed-demo.ts */
export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export function resolveSiteId(hostname: string): string {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return DEMO_TENANT_ID;
  }
  const sub = hostname.split(".")[0];
  return sub && sub.length > 0 ? sub : DEMO_TENANT_ID;
}
