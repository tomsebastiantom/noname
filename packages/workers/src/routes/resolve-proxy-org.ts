import { resolveOrgIdFromHost, resolveSiteId } from "../resolve-slug";
import type { Env } from "../types";
import { siteIdFromPath } from "./site-id-from-path";

/** Tenant org for edge → API proxy. Host/path slug beats JWT org (ZITADEL claim ≠ app tenant). */
export async function resolveProxyOrgId(
  env: Env,
  pathname: string,
  host: string,
  jwtOrgId: string | undefined,
  headerOrgId: string | undefined,
): Promise<string> {
  const fromPath = siteIdFromPath(pathname);
  if (fromPath) {
    const resolved = await resolveSiteId(env, fromPath);
    if (resolved) return resolved;
  }

  const fromHost = await resolveOrgIdFromHost(env, host);
  if (fromHost) return fromHost;

  if (jwtOrgId?.trim()) return jwtOrgId.trim();

  return headerOrgId?.trim() ?? "";
}
