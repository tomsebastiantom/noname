import { type DecodedJwt, getKey, importKey } from "@cfworker/jwt";
import { fetchWithTimeout } from "@noname/auth";
import { coerceScalarString } from "@noname/shared";
import { getCached, setCache } from "./cache";
import type { Env } from "./types";

const JWKS_CACHE_TTL_SEC = 3600;

interface JwksDocument {
  keys: Array<Record<string, unknown>>;
}

export function jwksCacheKey(issuer: string): string {
  return `jwks:${issuer.replace(/\/$/, "")}`;
}

function isLocalDevIssuer(issuer: string): boolean {
  try {
    const host = new URL(issuer).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** OIDC discovery `jwks_uri` (ZITADEL uses `/oauth/v2/keys`, not `/.well-known/jwks.json`). */
export async function resolveJwksUrl(issuer: string): Promise<string> {
  const base = issuer.replace(/\/$/, "");
  const discoveryUrl = `${base}/.well-known/openid-configuration`;
  const discovery = await fetchWithTimeout(discoveryUrl);
  if (discovery.ok) {
    const body = (await discovery.json()) as { jwks_uri?: string };
    const jwksUri = body.jwks_uri?.trim();
    if (jwksUri) return jwksUri;
  }
  return `${base}/.well-known/jwks.json`;
}

async function fetchJwksDocument(env: Env, issuer: string): Promise<JwksDocument> {
  const cacheKey = jwksCacheKey(issuer);
  const cacheable = !isLocalDevIssuer(issuer);
  if (cacheable) {
    const cached = await getCached<JwksDocument>(env, cacheKey);
    if (cached) return cached;
  }

  const url = await resolveJwksUrl(issuer);
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Error loading jwks at ${url}: ${response.status} ${response.statusText}`);
  }
  const jwks = (await response.json()) as JwksDocument;
  if (cacheable) {
    await setCache(env, cacheKey, jwks, JWKS_CACHE_TTL_SEC);
  }
  return jwks;
}

async function importJwksKeys(iss: string, jwks: JwksDocument): Promise<void> {
  for (const jwk of jwks.keys) {
    try {
      await importKey(iss, jwk as unknown as JsonWebKey);
    } catch {
      // IdP may publish keys this runtime cannot import; skip unsupported entries.
    }
  }
}

/** JWKS resolver with Workers KV cache + timeout (cross-isolate). */
export function createCachedGetKey(env: Env) {
  const warmedIssuers = new Set<string>();

  async function warmIssuer(iss: string): Promise<void> {
    if (warmedIssuers.has(iss)) return;
    const jwks = await fetchJwksDocument(env, iss);
    await importJwksKeys(iss, jwks);
    warmedIssuers.add(iss);
  }

  return async (decoded: DecodedJwt): Promise<CryptoKey> => {
    const iss = coerceScalarString(decoded.payload.iss, env.ZITADEL_ISSUER);
    await warmIssuer(iss);
    try {
      return getKey(decoded);
    } catch {
      // Stale KV JWKS (e.g. after ZITADEL re-seed) — bust cache and retry once.
      warmedIssuers.delete(iss);
      await env.KV.delete(jwksCacheKey(iss));
      await warmIssuer(iss);
      return getKey(decoded);
    }
  };
}
