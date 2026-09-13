/**
 * Stores a provider API key in Nango as a connection — the key travels
 * process memory → Nango vault, never files, logs, or our database.
 *
 * Usage (PowerShell):
 *   $env:CREDENTIAL_API_KEY = "rk_test_..."
 *   pnpm init:nango:connect
 *
 * Optional: $env:PROVIDER (default "stripe"), $env:CONNECTION_ID
 * (default "<slug>-<provider>-test", needs STORE_SLUG or defaults yogastore).
 * Requires: Nango provisioned (`pnpm init:nango`).
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loginWithCredentials } from "../../packages/server/src/seed";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NANGO_HOST = process.env.NANGO_HOST ?? "http://localhost:3003";
const PROVIDER = process.env.PROVIDER ?? "stripe";
const STORE_SLUG = process.env.STORE_SLUG ?? "yogastore";
const CONNECTION_ID = process.env.CONNECTION_ID ?? `${STORE_SLUG}-${PROVIDER}-test`;
const API_KEY = process.env.CREDENTIAL_API_KEY?.trim();
const API_BASE = process.env.API_BASE ?? "http://localhost:3000";
const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";

function rootEnv(key: string): string | undefined {
  try {
    const match = readFileSync(join(ROOT, ".env"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function signHmac(payload: string): string {
  const secret = process.env.WORKER_SERVER_SECRET ?? "";
  return secret ? createHmac("sha256", secret).update(payload).digest("base64") : "";
}

async function obtainAdminToken(): Promise<string> {
  const clientId = process.env.ZITADEL_CLIENT_ID?.trim();
  if (!clientId || !DEMO_ORG_ID) {
    throw new Error("ZITADEL_CLIENT_ID and ZITADEL_DEMO_ORG_ID are required to register the app mapping");
  }
  const email = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const password = process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!";
  const redirectUri = process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";
  const result = await loginWithCredentials({
    orgId: DEMO_ORG_ID,
    email,
    password,
    clientId,
    redirectUri,
    codeVerifier: randomBytes(32).toString("base64url"),
  });
  if (result.status !== "success" || !result.accessToken) {
    throw new Error("Could not obtain the local admin JWT to register the app mapping");
  }
  return result.accessToken;
}

async function registerAppConnection(): Promise<void> {
  const token = await obtainAdminToken();
  const identity = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const hmacPayload = `${DEMO_ORG_ID}:${identity}:admin`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-org-id": DEMO_ORG_ID,
    "x-user-id": identity,
    "x-role": "admin",
  };
  const hmac = signHmac(hmacPayload);
  if (hmac) headers["x-auth-hmac"] = hmac;

  const currentResponse = await fetch(`${API_BASE}/api/documents/tenant_settings/default`, { headers });
  if (!currentResponse.ok) {
    throw new Error(`Could not read tenant settings (${currentResponse.status})`);
  }
  const currentBody = (await currentResponse.json()) as {
    data?: { integrations?: Record<string, unknown> };
  };
  const integrations = currentBody.data?.integrations ?? {};
  const nango = integrations.nango && typeof integrations.nango === "object"
    ? (integrations.nango as Record<string, unknown>)
    : {};
  const updateResponse = await fetch(`${API_BASE}/api/documents/tenant_settings/default`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      integrations: {
        ...integrations,
        nango: { ...nango, [PROVIDER]: { connectionId: CONNECTION_ID } },
      },
    }),
  });
  if (!updateResponse.ok) {
    throw new Error(`Could not register the app connection (${updateResponse.status})`);
  }
  console.log(`Registered ${STORE_SLUG} → ${PROVIDER} → ${CONNECTION_ID} in Noname tenant settings.`);
}

async function main(): Promise<void> {
  const secret = process.env.NANGO_SECRET_KEY?.trim() ?? rootEnv("NANGO_SECRET_KEY")?.trim();
  if (!secret) {
    throw new Error("NANGO_SECRET_KEY missing — run pnpm init:nango first");
  }

  if (!API_KEY) {
    const existingResponse = await fetch(`${NANGO_HOST}/connections`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const existingBody = (await existingResponse.json().catch(() => null)) as {
      connections?: Array<{ connection_id?: string; provider_config_key?: string }>;
    } | null;
    const found = existingBody?.connections?.some(
      (connection) =>
        connection.connection_id === CONNECTION_ID && connection.provider_config_key === PROVIDER,
    );
    if (!existingResponse.ok || !found) {
      throw new Error(
        `Set CREDENTIAL_API_KEY to create ${CONNECTION_ID}, or provision that exact Nango connection first`,
      );
    }
    console.log(`Connection ${CONNECTION_ID} already exists in Nango; registering it in Noname.`);
  } else {
    const res = await fetch(`${NANGO_HOST}/connections`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_config_key: PROVIDER,
        connection_id: CONNECTION_ID,
        credentials: { type: "BASIC", username: API_KEY, password: "" },
      }),
    });
    const body = (await res.json().catch(() => null)) as { id?: number; error?: unknown } | null;
    if (!res.ok && res.status !== 409) {
      throw new Error(`Connection create failed (${res.status}): ${JSON.stringify(body)}`);
    }
    console.log(
      res.status === 409
        ? `Connection ${CONNECTION_ID} already exists in Nango; reusing it.`
        : `Connected ${PROVIDER} as ${CONNECTION_ID} (connection id ${body?.id}).`,
    );
  }
  await registerAppConnection();
  console.log("Key lives in Nango vault only — nothing stored locally.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
