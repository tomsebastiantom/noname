/**
 * Provision a tenant-scoped eval service account.
 *
 * The eval service reads tenant routes (`/api/eval/context`, documents, definitions), so it needs a credential
 * bound to that tenant org. This creates `eval-runner` in the tenant org with an `eval_reader` role and a key.
 *
 * Run: pnpm init:tenant-eval --org <orgId> [--project <projectId>]
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
const PAT_PATH = join(ROOT, "zitadel_keys", "login-client.pat");
const KEY_EXPIRY = "2030-01-01T00:00:00Z";
const ROLE_KEY = "eval_reader";

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const orgId = arg("org")?.trim();
const projectId = arg("project")?.trim() ?? process.env.ZITADEL_PROJECT_ID?.trim();
if (!orgId || !projectId) {
  console.error("usage: init-tenant-eval --org <orgId> [--project <projectId>]");
  process.exit(2);
}

const userName = `eval-runner-${orgId}`;

const pat = process.env.ZITADEL_ADMIN_PAT?.trim() ||
  (existsSync(PAT_PATH) ? readFileSync(PAT_PATH, "utf8").trim() : "");
if (!pat) {
  console.error("ZITADEL_ADMIN_PAT is required (or run pnpm init:zitadel)");
  process.exit(1);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${ISSUER}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      "x-zitadel-orgid": orgId!,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function ensureRole(): Promise<void> {
  try {
    await api("POST", `/management/v1/projects/${projectId}/roles`, {
      roleKey: ROLE_KEY,
      displayName: "Eval reader",
      group: "Automation",
    });
    console.log(`Role ${ROLE_KEY}: created`);
  } catch (error) {
    if (/already exists|409/i.test((error as Error).message)) {
      console.log(`Role ${ROLE_KEY}: exists`);
      return;
    }
    throw error;
  }
}

async function ensureUser(): Promise<string> {
  const search = await api<{ result?: Array<{ id: string; userName: string; machine?: unknown }> }>(
    "POST",
    "/management/v1/users/_search",
    {
      queries: [{ userNameQuery: { userName: userName, method: "TEXT_QUERY_METHOD_EQUALS" } }],
      limit: 1,
    },
  );
  const existing = search.result?.find((user) => user.userName === userName && user.machine);
  if (existing) {
    console.log(`Service account ${userName}: ${existing.id} (reused)`);
    return existing.id;
  }
  const created = await api<{ userId: string }>("POST", "/management/v1/users/machine", {
    userName: userName,
    name: "Eval runner",
    description: "Tenant eval runner (service account)",
    accessTokenType: "ACCESS_TOKEN_TYPE_JWT",
  });
  console.log(`Service account ${userName}: ${created.userId} (created)`);
  return created.userId;
}

async function ensureKey(userId: string): Promise<string> {
  const relative = `zitadel_keys/tenants/${orgId}/eval-runner-sa.json`;
  const path = join(ROOT, relative);
  if (existsSync(path)) {
    console.log(`Key: ${relative} (exists)`);
    return relative;
  }
  const created = await api<{ keyContent: string }>("POST", `/v2/users/${userId}/keys`, {
    type: "KEY_TYPE_JSON",
    expirationDate: KEY_EXPIRY,
  });
  const decoded = Buffer.from(created.keyContent, "base64").toString("utf8");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(JSON.parse(decoded), null, 2)}\n`, { mode: 0o600 });
  console.log(`Key: ${relative} (created)`);
  return relative;
}

async function ensureGrant(userId: string): Promise<void> {
  try {
    await api("POST", `/management/v1/users/${userId}/grants`, {
      projectId,
      roleKeys: [ROLE_KEY],
    });
    console.log(`Grant ${ROLE_KEY}: created`);
  } catch (error) {
    if (/already exists|409|Conflict/i.test((error as Error).message)) {
      console.log(`Grant ${ROLE_KEY}: exists`);
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  await ensureRole();
  const userId = await ensureUser();
  const keyPath = await ensureKey(userId);
  await ensureGrant(userId);
  console.log("\nTenant eval identity ready.");
  console.log(`  org=${orgId}`);
  console.log(`  project=${projectId}`);
  console.log(`  key=${keyPath}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
