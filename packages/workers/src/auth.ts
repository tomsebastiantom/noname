import { getKey, parseJwt } from "@cfworker/jwt";
import type { EdgeContext, Env } from "./types";

export async function validateJwt(request: Request, env: Env): Promise<EdgeContext | Response> {
  const cookie = request.headers.get("Cookie") || "";
  const authHeader = request.headers.get("Authorization") || "";

  const token = authHeader.replace(/^Bearer\s+/i, "") || cookie.match(/access_token=([^;]+)/)?.[1];

  if (!token) {
    return redirectToLogin(request, env);
  }

  try {
    const result = await parseJwt({
      jwt: token,
      issuer: env.ZITADEL_ISSUER,
      audience: "",
      resolveKey: getKey,
    });

    if (!result.valid) {
      console.error("JWT validation failed:", result.reason);
      return redirectToLogin(request, env);
    }

    const payload = result.payload as unknown as Record<string, unknown>;

    return {
      orgId:
        (payload.org_id as string) || (payload["urn:zitadel:iam:org:id"] as string) || "",
      userId: (payload.sub as string) || "",
      role: (payload.role as string) || "customer",
    };
  } catch (err) {
    console.error("JWT validation error:", err);
    return redirectToLogin(request, env);
  }
}

function redirectToLogin(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const authRequestId = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(
    `${env.ZITADEL_ISSUER}/ui/v2/login/login?authRequest=${authRequestId}`,
    302,
  );
}
