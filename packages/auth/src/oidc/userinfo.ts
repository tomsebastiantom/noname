import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  MAX_JSON_BODY_BYTES,
} from "../fetch-with-timeout";
import { rolesFromTokenPayload } from "../jwt/roles";
import type { PlatformRole } from "../permissions";

/** OIDC userinfo — includes project roles when omitted from access token JWT. */
export async function fetchUserinfo(
  accessToken: string,
  issuer: string,
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(
    `${issuer.replace(/\/$/, "")}/oidc/v1/userinfo`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Userinfo request failed (${res.status})`);
  }
  const lengthHeader = res.headers.get("content-length");
  if (lengthHeader) {
    const length = Number.parseInt(lengthHeader, 10);
    if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
      throw new Error("Userinfo response too large");
    }
  }
  const text = await res.text();
  if (text.length > MAX_JSON_BODY_BYTES) {
    throw new Error("Userinfo response too large");
  }
  const body = JSON.parse(text) as unknown;
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
