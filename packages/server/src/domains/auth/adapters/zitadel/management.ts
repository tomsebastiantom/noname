import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConflictError } from "../../../../shared/domain-error";
import { zitadelIssuer } from "./issuer";

const issuer = zitadelIssuer();
const MANAGEMENT_BASE = `${issuer}/management/v1`;
export const ZITADEL_V2_BASE = `${issuer}/v2`;

interface ServiceAccountKey {
  keyId: string;
  userId: string;
  key: string;
}

function loadServiceAccountKey(): ServiceAccountKey {
  if (process.env.ZITADEL_MACHINE_KEY_JSON) {
    return JSON.parse(process.env.ZITADEL_MACHINE_KEY_JSON) as ServiceAccountKey;
  }

  const paths = [
    process.env.ZITADEL_MACHINE_KEY_PATH,
    join(process.cwd(), "zitadel_keys/noname-backend-sa.json"),
    join(process.cwd(), "../../zitadel_keys/noname-backend-sa.json"),
  ].filter((p): p is string => Boolean(p));

  for (const path of paths) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as ServiceAccountKey;
    }
  }

  throw new Error(
    "ZITADEL machine key not found — run pnpm init:zitadel or set ZITADEL_MACHINE_KEY_PATH",
  );
}

function signAssertion(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: sa.keyId })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.userId,
      sub: sa.userId,
      aud: issuer,
      iat: now,
      exp: now + 300,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(input);
  sign.end();
  return `${input}.${sign.sign(sa.key).toString("base64url")}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const sa = loadServiceAccountKey();
  const res = await fetch(`${issuer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      scope: "openid urn:zitadel:iam:org:project:id:zitadel:aud",
      assertion: signAssertion(sa),
    }),
  });

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`ZITADEL management token failed: ${body.error_description ?? res.status}`);
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

function orgHeaders(orgId: string, token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-zitadel-orgid": orgId,
  };
}

async function managementRequest<T>(
  orgId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getManagementToken();
  const res = await fetch(`${MANAGEMENT_BASE}${path}`, {
    method,
    headers: orgHeaders(orgId, token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  const err = parsed as { code?: number | string; message?: string };
  const alreadyExists =
    err.code === 6 ||
    err.code === "already_exists" ||
    err.message?.toLowerCase().includes("already");

  if (!res.ok && !alreadyExists) {
    throw new Error(`ZITADEL ${path} → ${res.status}: ${err.message ?? text}`);
  }

  return parsed as T;
}

async function ensureOrgLoginPolicy(orgId: string): Promise<void> {
  let policy: { allowExternalIdp?: boolean; allowUsernamePassword?: boolean } | undefined;

  try {
    const current = await managementRequest<{
      policy?: { allowExternalIdp?: boolean; allowUsernamePassword?: boolean };
    }>(orgId, "GET", "/policies/login");
    policy = current.policy;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Login Policy not found")) {
      throw err;
    }
    await managementRequest(orgId, "POST", "/policies/login", {
      allowExternalIdp: true,
      allowUsernamePassword: true,
    });
    return;
  }

  if (policy?.allowExternalIdp === true) {
    return;
  }

  try {
    await managementRequest(orgId, "PUT", "/policies/login", {
      ...policy,
      allowExternalIdp: true,
      allowUsernamePassword: policy?.allowUsernamePassword ?? true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("NotChanged")) {
      throw err;
    }
  }
}

async function ensureIdpOnLoginPolicy(orgId: string, idpId: string): Promise<void> {
  await ensureOrgLoginPolicy(orgId);
  await managementRequest(orgId, "POST", "/policies/login/idps", {
    idpId,
    ownerType: "IDP_OWNER_TYPE_ORG",
  });
}

export async function upsertZitadelIdp(
  orgId: string,
  zitadelPath: string,
  displayName: string,
  payload: Record<string, unknown>,
  existingIdpId?: string,
): Promise<string> {
  if (existingIdpId) {
    try {
      await managementRequest(orgId, "PUT", `/idps/${zitadelPath}/${existingIdpId}`, payload);
      await ensureIdpOnLoginPolicy(orgId, existingIdpId);
      return existingIdpId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("NotExisting") && !message.includes("404")) {
        throw err;
      }
    }
  }

  const created = await managementRequest<{ id?: string }>(
    orgId,
    "POST",
    `/idps/${zitadelPath}`,
    payload,
  );
  if (!created.id) {
    throw new Error(`ZITADEL did not return a ${displayName} IdP id`);
  }

  await ensureIdpOnLoginPolicy(orgId, created.id);
  return created.id;
}

/** Test hook — reset cached management token between tests. */
export function resetManagementTokenCache(): void {
  cachedToken = null;
}

export { getManagementToken };

/** Connect/gRPC-style ZITADEL APIs (project roles, authorizations, etc.). */
export async function connectRequest<T>(
  orgId: string,
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const token = await getManagementToken();
  const res = await fetch(`${issuer}${path}`, {
    method,
    headers: {
      ...orgHeaders(orgId, token),
      "Connect-Protocol-Version": "1",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  const err = parsed as { code?: number | string; message?: string };
  const alreadyExists =
    err.code === 6 ||
    err.code === "already_exists" ||
    err.message?.toLowerCase().includes("already");

  if (!res.ok && !alreadyExists) {
    throw new Error(`ZITADEL connect ${path} → ${res.status}: ${err.message ?? text}`);
  }

  return parsed as T;
}

export async function v2Request<T>(
  orgId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getManagementToken();
  const res = await fetch(`${ZITADEL_V2_BASE}${path}`, {
    method,
    headers: orgHeaders(orgId, token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  const err = parsed as { code?: number | string; message?: string };
  const alreadyExists =
    err.code === 6 ||
    err.code === "already_exists" ||
    err.message?.toLowerCase().includes("already");

  if (!res.ok) {
    if (alreadyExists) {
      throw new ConflictError(err.message ?? "Resource already exists");
    }
    throw new Error(`ZITADEL v2 ${path} → ${res.status}: ${err.message ?? text}`);
  }

  return parsed as T;
}
