import { apiFetchOptional } from "../lib/api";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
}

let cached: OidcConfig | null = null;

/** Public OIDC settings — written by `pnpm init:zitadel` to `public/oidc.json`. */
export async function loadOidcConfig(): Promise<OidcConfig | null> {
  if (cached) return cached;
  try {
    const data = await apiFetchOptional<OidcConfig>("/oidc.json");
    if (!data?.clientId) return null;
    cached = data;
    return cached;
  } catch {
    return null;
  }
}
