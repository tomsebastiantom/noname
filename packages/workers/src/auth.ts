import { getKey, parseJwt } from "@cfworker/jwt";
import type { EdgeContext, Env } from "./types";

function orgIdFromPayload(payload: Record<string, unknown>): string {
  return (
    (payload["urn:zitadel:iam:org:id"] as string) ||
    (payload.org_id as string) ||
    (payload.tenant_id as string) ||
    ""
  );
}

/** Returns identity from JWT, or null when no/invalid token (no redirect). */
export async function tryParseJwt(request: Request, env: Env): Promise<EdgeContext | null> {
  const cookie = request.headers.get("Cookie") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const token =
    authHeader.replace(/^Bearer\s+/i, "") || cookie.match(/access_token=([^;]+)/)?.[1];

  if (!token) return null;

  try {
    const result = await parseJwt({
      jwt: token,
      issuer: env.ZITADEL_ISSUER,
      audience: "",
      resolveKey: getKey,
    });

    if (!result.valid) return null;

    const payload = result.payload as unknown as Record<string, unknown>;
    return {
      orgId: orgIdFromPayload(payload),
      userId: (payload.sub as string) || "",
      role: (payload.role as string) || "customer",
    };
  } catch {
    return null;
  }
}

export async function validateJwt(request: Request, env: Env): Promise<EdgeContext | Response> {
  const ctx = await tryParseJwt(request, env);
  if (ctx) return ctx;
  return redirectToLogin(request, env);
}

function redirectToLogin(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const authRequestId = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(
    `${env.ZITADEL_ISSUER}/ui/v2/login/login?authRequest=${authRequestId}`,
    302,
  );
}
