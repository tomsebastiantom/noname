import { parseJwt } from "@cfworker/jwt";
import { accessTokenFromRequest, resolveIdentityFromTokenPayload } from "@noname/auth";
import { createCachedGetKey } from "./jwks-cache";
import type { EdgeContext, Env } from "./types";

/** Returns identity from JWT, or null when no/invalid token (no redirect). */
export async function tryParseJwt(request: Request, env: Env): Promise<EdgeContext | null> {
  const token = accessTokenFromRequest(request);
  if (!token) return null;

  try {
    const result = await parseJwt({
      jwt: token,
      issuer: env.ZITADEL_ISSUER,
      audience: env.ZITADEL_CLIENT_ID,
      resolveKey: createCachedGetKey(env),
    });

    if (!result.valid) return null;

    const payload = result.payload as unknown as Record<string, unknown>;
    const projectId = env.ZITADEL_PROJECT_ID?.trim() || undefined;
    return resolveIdentityFromTokenPayload(token, payload, {
      projectId,
      issuer: env.ZITADEL_ISSUER,
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
