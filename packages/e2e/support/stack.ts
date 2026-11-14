import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

/**
 * Shared e2e plumbing.
 *
 * Everything here talks to the running stack the way a real caller would: an operator logs in through the API, the
 * browser loads the console from the edge schema, and no test reaches into Postgres to assert. If a test cannot prove
 * its claim through a public surface, that is a gap in the product, not a reason to peek behind it.
 */
const ROOT = join(import.meta.dirname, "../../..");

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env", "packages/server/.env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match?.[1] && !(match[1] in env)) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

const env = readEnv();

export const API = env.API_BASE ?? "http://127.0.0.1:3000";
export const PLATFORM_ORG_ID = env.PLATFORM_ORG_ID ?? "";
export const PLATFORM_PROJECT_ID = env.ZITADEL_PLATFORM_PROJECT_ID ?? "";
export const PLATFORM_CLIENT_ID = env.ZITADEL_PLATFORM_CLIENT_ID ?? "399599961710264429";
export const CLIENT_BASE = env.CLIENT_BASE ?? "http://platform.localhost:5173";
export const OPERATOR_EMAIL = env.E2E_OPERATOR_EMAIL ?? "op2@noname.local";
export const OPERATOR_PASSWORD = env.E2E_OPERATOR_PASSWORD ?? "Operator!Passw0rd";

const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  join(
    process.env.USERPROFILE ?? process.env.HOME ?? "",
    "AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe",
  );

function edgeHmac(userId: string, role: string): string {
  const secret = env.WORKER_SERVER_SECRET ?? "";
  return createHmac("sha256", secret)
    .update(`${PLATFORM_ORG_ID}:${userId}:${role}`)
    .digest("base64");
}

/** Headers the edge would add for an anonymous caller — the API refuses traffic that did not come through it. */
export function anonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-org-id": PLATFORM_ORG_ID,
    "x-user-id": "anon",
    "x-role": "anonymous",
    "x-auth-hmac": edgeHmac("anon", "anonymous"),
  };
}

/** Platform operator session token, obtained the same way the console does. */
export async function operatorToken(): Promise<string> {
  const response = await fetch(`${API}/api/auth/platform/login`, {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      email: OPERATOR_EMAIL,
      password: OPERATOR_PASSWORD,
      codeVerifier: "e2e-verifier-0123456789-abcdefghijklmnopqrstuvwxyz-._~",
      clientId: PLATFORM_CLIENT_ID,
      redirectUri: `${CLIENT_BASE}/auth/callback`,
    }),
  });
  const body = (await response.json()) as { data?: { accessToken?: string } };
  const token = body.data?.accessToken;
  if (!token) throw new Error(`operator login failed (${response.status})`);
  return token;
}

/** Subject of a JWT — the operator's ZITADEL user id, needed for the edge attestation headers. */
export function tokenSubject(token: string): string {
  const segment = token.split(".")[1] ?? "";
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as { sub?: string };
  return claims.sub ?? "";
}

/**
 * Authenticated call to the platform API as the operator.
 *
 * The API refuses traffic that did not come through the edge, so these headers are not optional — the same lesson the
 * provisioning scripts learned. Sending only a bearer token answers 401, which looks like a bad token.
 */
export async function platformApi<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const userId = tokenSubject(token);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-org-id": PLATFORM_ORG_ID,
      "x-user-id": userId,
      "x-role": "user",
      "x-auth-hmac": edgeHmac(userId, "user"),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T;
  return { status: response.status, body };
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ["--host-resolver-rules=MAP platform.localhost 127.0.0.1"],
  });
}

/** Signs the operator in through the real login form, confirming the stack treats them as a platform operator. */
export async function signInAsOperator(page: Page): Promise<void> {
  await page.goto(`${CLIENT_BASE}/login?redirect=%2Fadmin%2Fplatform`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.fill('input[type="email"]', OPERATOR_EMAIL);
  await page.fill('input[type="password"]', OPERATOR_PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((url) => url.pathname.startsWith("/admin/platform"), { timeout: 60_000 });
}

/** Polls until provisioning reports `ready`, or fails with the steps that did not complete. */
export async function waitForProvisioning(
  token: string,
  orgId: string,
  timeoutMs = 90_000,
): Promise<{ state: string; steps: Record<string, { status: string }> }> {
  const deadline = Date.now() + timeoutMs;
  let last: { state: string; steps: Record<string, { status: string }> } = { state: "unknown", steps: {} };
  while (Date.now() < deadline) {
    const { status, body } = await platformApi<{
      data?: { state: string; steps: Record<string, { status: string }> };
    }>(token, `/api/platform/tenants/${orgId}/provisioning`);
    if (status === 200 && body.data) {
      last = body.data;
      if (last.state === "ready" || last.state === "failed") return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return last;
}

/** Removes a tenant created by a test: the ZITADEL org first, so no identity outlives the test. */
export async function deleteTenantOrg(orgId: string): Promise<void> {
  const pat = readFileSync(join(ROOT, "zitadel_keys/login-client.pat"), "utf8").trim();
  await fetch(`${env.ZITADEL_ISSUER ?? "http://localhost:8080"}/v2/organizations/${orgId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${pat}` },
  });
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
