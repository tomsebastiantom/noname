import { rolesFromTokenPayload } from "../jwt/roles";
import type { PlatformRole } from "../permissions";

/** OIDC userinfo — includes project roles when omitted from access token JWT. */
export async function fetchUserinfo(
  accessToken: string,
  issuer: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${issuer.replace(/\/$/, "")}/oidc/v1/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Userinfo request failed (${res.status})`);
  }
  const body = (await res.json()) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid userinfo response");
  }
  return body as Record<string, unknown>;
}

export async function rolesFromUserinfo(
  accessToken: string,
  issuer: string,
  projectId?: string,
): Promise<PlatformRole[]> {
  try {
    const body = await fetchUserinfo(accessToken, issuer);
    return rolesFromTokenPayload(body, { projectId });
  } catch {
    return [];
  }
}
