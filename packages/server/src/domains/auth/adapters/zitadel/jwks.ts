/**
 * ZITADEL JWKS resolution for origin-side access-token verification.
 *
 * The edge worker validates JWTs with `@cfworker/jwt`. The origin previously
 * trusted the raw token without verifying it, which is only safe while every
 * request is guaranteed to have passed through the edge. Since public routes
 * and stream-ticket paths can forward a caller-supplied credential (header or
 * `?access_token=`), the origin must verify the signature itself before
 * deriving identity or permissions.
 *
 * Keys are cached per issuer. An unknown `kid` triggers a single refetch so
 * ZITADEL key rotation does not require a restart.
 */

import type { AccessTokenHeader } from "@noname/auth";
import { fetchWithTimeout } from "@noname/auth";

/** `kid` is part of JWKS but absent from the DOM `JsonWebKey` type. */
export type SigningJwk = JsonWebKey & { kid?: string };

interface DiscoveryDocument {
  jwks_uri?: unknown;
}

interface JwksDocument {
  keys?: unknown;
}

interface CachedJwks {
  keys: SigningJwk[];
  expiresAt: number;
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 5 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5000;

let discoveryCache: { issuer: string; jwksUri: string; expiresAt: number } | null = null;
let jwksCache: CachedJwks | null = null;
let inflight: Promise<CachedJwks | null> | null = null;

function isSigningJwk(value: unknown): value is SigningJwk {
  return (
    Boolean(value) && typeof value === "object" && typeof (value as SigningJwk).kty === "string"
  );
}

async function discoverJwksUri(issuer: string): Promise<string | null> {
  const now = Date.now();
  if (discoveryCache && discoveryCache.issuer === issuer && discoveryCache.expiresAt > now) {
    return discoveryCache.jwksUri;
  }
  try {
    const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await fetchWithTimeout(url, {}, JWKS_FETCH_TIMEOUT_MS);
    if (!response.ok) return null;
    const document = (await response.json()) as DiscoveryDocument;
    if (typeof document.jwks_uri !== "string" || !document.jwks_uri) return null;
    discoveryCache = { issuer, jwksUri: document.jwks_uri, expiresAt: now + DISCOVERY_TTL_MS };
    return document.jwks_uri;
  } catch {
    return null;
  }
}

async function fetchJwks(jwksUri: string): Promise<CachedJwks | null> {
  try {
    const response = await fetchWithTimeout(jwksUri, {}, JWKS_FETCH_TIMEOUT_MS);
    if (!response.ok) return null;
    const document = (await response.json()) as JwksDocument;
    if (!Array.isArray(document.keys)) return null;
    const keys = document.keys.filter(isSigningJwk);
    if (keys.length === 0) return null;
    return { keys, expiresAt: Date.now() + JWKS_TTL_MS };
  } catch {
    return null;
  }
}

/**
 * Load the key set, deduplicating concurrent refreshes. A cached-but-expired
 * set is still served if the refresh fails, so a brief ZITADEL outage does not
 * sign every user out.
 */
async function loadJwks(issuer: string, force: boolean): Promise<CachedJwks | null> {
  const now = Date.now();
  if (!force && jwksCache && jwksCache.expiresAt > now) return jwksCache;
  if (inflight) return inflight;

  const previous = jwksCache;
  inflight = (async () => {
    const jwksUri = await discoverJwksUri(issuer);
    if (!jwksUri) return previous;
    const fetched = await fetchJwks(jwksUri);
    if (fetched) {
      jwksCache = fetched;
      return fetched;
    }
    return previous;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function selectKey(keys: SigningJwk[], header: AccessTokenHeader): SigningJwk | null {
  if (header.kid) {
    return keys.find((key) => key.kid === header.kid) ?? null;
  }
  // No kid: only safe to guess when the issuer publishes exactly one key.
  return keys.length === 1 ? (keys[0] as SigningJwk) : null;
}

/** Resolve the signing key for a token header, refreshing once on an unknown kid. */
export async function resolveZitadelJwk(header: AccessTokenHeader): Promise<JsonWebKey | null> {
  const issuer = process.env.ZITADEL_ISSUER?.trim() || "http://localhost:8080";

  const cached = await loadJwks(issuer, false);
  const fromCache = cached ? selectKey(cached.keys, header) : null;
  if (fromCache) return fromCache;

  const refreshed = await loadJwks(issuer, true);
  return refreshed ? selectKey(refreshed.keys, header) : null;
}

/** Test seam — clears cached discovery/JWKS documents and in-flight state. */
export function resetZitadelJwksCache(): void {
  discoveryCache = null;
  jwksCache = null;
  inflight = null;
}
