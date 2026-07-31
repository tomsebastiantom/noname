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
  const cached = await getCached<JwksDocument>(env, cacheKey);
  if (cached) return cached;

  const url = await resolveJwksUrl(issuer);
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Error loading jwks at ${url}: ${response.status} ${response.statusText}`);
  }
  const jwks = (await response.json()) as JwksDocument;
  await setCache(env, cacheKey, jwks, JWKS_CACHE_TTL_SEC);
  return jwks;
}

/** JWKS resolver with Workers KV cache + timeout (cross-isolate). */
export function createCachedGetKey(env: Env) {
  const warmedIssuers = new Set<string>();

  return async (decoded: DecodedJwt): Promise<CryptoKey> => {
    const iss = coerceScalarString(decoded.payload.iss, env.ZITADEL_ISSUER);
    if (!warmedIssuers.has(iss)) {
      const jwks = await fetchJwksDocument(env, iss);
      await Promise.all(jwks.keys.map((jwk) => importKey(iss, jwk as unknown as JsonWebKey)));
      warmedIssuers.add(iss);
    }
    return getKey(decoded);
  };
}
