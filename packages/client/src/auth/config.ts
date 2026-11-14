import { apiFetchOptional } from "../lib/api";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
}

let cached: OidcConfig | null = null;

/**
 * The operator console is a different application from the tenant storefront: it authenticates against the
 * **platform** project, so a platform operator's token carries the platform org instead of a customer's. That is
 * what makes `platform_operator` resolvable at all — the server looks grants up against the org the token belongs to.
 */
function configPath(): string {
  if (typeof window === "undefined") return "/oidc.json";
  const host = window.location.hostname;
  return host === "platform.localhost" || host.startsWith("platform.")
    ? "/oidc-platform.json"
    : "/oidc.json";
}

/** Public OIDC settings — `oidc.json` from `pnpm init:zitadel`, `oidc-platform.json` for the console. */
export async function loadOidcConfig(): Promise<OidcConfig | null> {
  if (cached) return cached;
  try {
    const data = await apiFetchOptional<OidcConfig>(configPath());
    if (!data?.clientId) return null;
    cached = data;
    return cached;
  } catch {
    return null;
  }
}
