import { parseJwt } from "@cfworker/jwt";
import { accessTokenFromRequest, resolveIdentityFromTokenPayload } from "@noname/auth";
import { createCachedGetKey } from "./jwks-cache";
import type { EdgeContext, Env } from "./types";

/**
 * Audiences the edge treats as a signed-in caller.
 *
 * ZITADEL puts the OIDC client id, the project id and the resource owner in `aud`. Accepting every identifier we own
 * keeps the edge from silently downgrading a valid platform-operator token to anonymous — which is exactly what
 * happened when only the tenant client was accepted: the API saw an unsigned call and answered 401.
 */
/** The `aud` claim, or an empty list when it cannot be read. */
function audiencesOf(token: string): string[] {
  try {
    const segment = token.split(".")[1] ?? "";
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as {
      aud?: unknown;
    };
    if (Array.isArray(json.aud)) return json.aud.filter((value): value is string => typeof value === "string");
    return typeof json.aud === "string" ? [json.aud] : [];
  } catch {
    return [];
  }
}

/**
 * `@cfworker/jwt` validates against a single audience, so pick the one this token actually carries.
 * Verification still fails closed when nothing matches: we fall back to the tenant client, which the token does not
 * carry, and the parse result is invalid.
 */
function matchedAudience(token: string, env: Env): string {
  const present = audiencesOf(token);
  const ours = [env.ZITADEL_CLIENT_ID, env.ZITADEL_PROJECT_ID, env.ZITADEL_PLATFORM_PROJECT_ID, env.ZITADEL_PLATFORM_CLIENT_ID]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return ours.find((id) => present.includes(id)) ?? env.ZITADEL_CLIENT_ID;
}

function acceptableAudiences(env: Env): string[] {
  return [
    env.ZITADEL_CLIENT_ID,
    env.ZITADEL_PROJECT_ID,
    env.ZITADEL_PLATFORM_PROJECT_ID,
    env.ZITADEL_PLATFORM_CLIENT_ID,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

/** Returns identity from JWT, or null when no/invalid token (no redirect). */
export async function tryParseJwt(request: Request, env: Env): Promise<EdgeContext | null> {
  const token = accessTokenFromRequest(request);
  if (!token) return null;

  try {
    const result = await parseJwt({
      jwt: token,
      issuer: env.ZITADEL_ISSUER,
      audience: matchedAudience(token, env),
      resolveKey: createCachedGetKey(env),
    });

    if (!result.valid) return null;

    const payload = result.payload as unknown as Record<string, unknown>;
    const projectId = env.ZITADEL_PROJECT_ID?.trim() || undefined;
    return resolveIdentityFromTokenPayload(token, payload, {
      projectId,
      issuer: env.ZITADEL_ISSUER,
      // Local dev only: survives a stale ZITADEL_PROJECT_ID. Must never be set in
      // deployed vars — see RoleLookupOptions.allowProjectIdFallback.
      allowProjectIdFallback: env.ZITADEL_ALLOW_PROJECT_ID_FALLBACK === "true",
    });
  } catch {
    return null;
  }
}

export async function validateJwt(request: Request, env: Env): Promise<EdgeContext | Response> {
  const ctx = await tryParseJwt(request, env);
  if (ctx) return ctx;
  return unauthenticatedResponse(request, env);
}

function unauthenticatedResponse(request: Request, env: Env): Response {
  const url = new URL(request.url);
  // fetch() cannot follow cross-origin login redirects — API clients need 401 JSON.
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized — sign in required" }, { status: 401 });
  }
  const authRequestId = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(
    `${env.ZITADEL_ISSUER}/ui/v2/login/login?authRequest=${authRequestId}`,
    302,
  );
}
