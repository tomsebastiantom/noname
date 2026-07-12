import type { Env, EdgeContext } from "./types";

const JWKS_CACHE_KEY = "logto:jwks";
const JWKS_CACHE_TTL = 3600;

interface JwtPayload {
  sub: string;
  tenant_id: string;
  role: string;
  exp: number;
}

// JWK — simplistic representation; real validation needs jose or @cfworker/jwt
interface Jwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n?: string;
  e?: string;
}

export async function validateJwt(request: Request, env: Env): Promise<EdgeContext | Response> {
  const cookie = request.headers.get("Cookie") || "";
  const authHeader = request.headers.get("Authorization") || "";

  const token = authHeader.replace(/^Bearer\s+/i, "") || cookie.match(/access_token=([^;]+)/)?.[1];

  if (!token) {
    const url = new URL(request.url);
    const redirectUri = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${env.LOGTO_ENDPOINT}/sign-in?redirect_uri=${redirectUri}`, 302);
  }

  // TODO: Real JWT validation with jose library
  // 1. Fetch JWKS from LOGTO_ENDPOINT/oidc/jwks (cached in KV)
  // 2. Verify signature, expiry, issuer
  // 3. Extract payload
  try {
    const payload = decodeJwtPayload(token);

    if (payload.exp < Date.now() / 1000) {
      const url = new URL(request.url);
      const redirectUri = encodeURIComponent(url.pathname + url.search);
      return Response.redirect(`${env.LOGTO_ENDPOINT}/sign-in?redirect_uri=${redirectUri}`, 302);
    }

    return {
      tenantId: payload.tenant_id || "",
      userId: payload.sub,
      role: payload.role || "customer",
    };
  } catch {
    const url = new URL(request.url);
    const redirectUri = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${env.LOGTO_ENDPOINT}/sign-in?redirect_uri=${redirectUri}`, 302);
  }
}

export async function getJwks(env: Env): Promise<Jwk[]> {
  const cached = await env.KV.get(JWKS_CACHE_KEY, "json");
  if (cached) return cached as Jwk[];

  const response = await fetch(`${env.LOGTO_ENDPOINT}/oidc/jwks`);
  const { keys } = (await response.json()) as { keys: Jwk[] };

  await env.KV.put(JWKS_CACHE_KEY, JSON.stringify(keys), {
    expirationTtl: JWKS_CACHE_TTL,
  });

  return keys;
}

function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const payload = parts[1]!;
  const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decoded) as JwtPayload;
}
