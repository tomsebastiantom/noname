/**
 * Origin-side access-token verification.
 *
 * Anywhere the API derives identity, roles, or permissions from a caller
 * supplied token, it must come from here — never from the unverified
 * `decodeAccessTokenPayload` path.
 *
 * Why this exists: the edge validates JWTs on normal routes, but it
 * deliberately lets some routes through without validation (public routes and
 * stream-ticket bypasses) while still forwarding the caller's credential. The
 * origin therefore cannot assume a presented token was ever checked.
 *
 * Verified payloads are cached on the request context so a single request
 * verifies at most once.
 */

import { verifyAccessToken } from "@noname/auth";
import type { Context } from "hono";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { resolveZitadelJwk } from "./adapters/zitadel/jwks";
import { resolveAccessToken } from "./token-source";

declare module "hono" {
  interface ContextVariableMap {
    verifiedTokenPayload: Record<string, unknown> | null;
    verifiedTokenSource: string;
  }
}

/**
 * Verify a token with no request context available (e.g. a callback that only
 * receives a raw bearer string).
 */
export async function verifyTokenPayload(token: string): Promise<Record<string, unknown> | null> {
  return verifyAccessToken(token, {
    issuer: zitadelIssuer(),
    audience: process.env.ZITADEL_CLIENT_ID?.trim() || undefined,
    resolveKey: resolveZitadelJwk,
  });
}

/**
 * Verify a token and return its payload, or `null` when unauthenticated.
 * `tokenOverride` lets callers verify an explicitly supplied credential
 * (e.g. a stream ticket's `?access_token=`).
 */
export async function verifiedTokenPayload(
  c: Context,
  tokenOverride?: string,
): Promise<Record<string, unknown> | null> {
  const token = tokenOverride ?? resolveAccessToken(c);
  if (!token) return null;

  if (c.get("verifiedTokenSource") === token) {
    return c.get("verifiedTokenPayload") ?? null;
  }

  const payload = await verifyTokenPayload(token);

  c.set("verifiedTokenSource", token);
  c.set("verifiedTokenPayload", payload);
  return payload;
}

/** Verified `sub`, or `null`. */
export async function verifiedUserId(c: Context, tokenOverride?: string): Promise<string | null> {
  const payload = await verifiedTokenPayload(c, tokenOverride);
  const sub = payload?.sub;
  return typeof sub === "string" && sub.trim() ? sub.trim() : null;
}
