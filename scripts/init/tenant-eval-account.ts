/**
 * Provision a tenant-scoped eval service account.
 *
 * The eval service reads tenant routes (`/api/eval/context`, documents, definitions), so it needs a credential
 * bound to that tenant org. This creates `eval-runner` in the tenant org with an `eval_reader` role and a key.
 *
 * Run: pnpm init:tenant-eval --org <orgId> [--project <projectId>]
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ServiceAccountKey,
  VaultSecretNotFoundError,
  readTenantEvalKey,
  vaultConfigFromEnv,
  writeTenantEvalKey,
} from "@noname/eval";

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

async function ensureKey(userId: string): Promise<void> {
  const vault = vaultConfigFromEnv();
  if (!vault) {
    throw new Error("VAULT_AUTH_MODE and VAULT_ADDR are required; tenant eval keys live in Vault");
  }

  try {
    await readTenantEvalKey(orgId!, vault);
    console.log(`Key: Vault ${vault.pathPrefix}/orgs/${orgId}/eval/service-account (exists)`);
    return;
  } catch (error) {
    if (!(error instanceof VaultSecretNotFoundError)) throw error;
    // The secret does not exist yet; create it and write it once.
  }

  const created = await api<{ keyContent: string }>("POST", `/v2/users/${userId}/keys`, {
    type: "KEY_TYPE_JSON",
    expirationDate: KEY_EXPIRY,
  });
  const decoded = Buffer.from(created.keyContent, "base64").toString("utf8");
  const key = JSON.parse(decoded) as ServiceAccountKey;
  await writeTenantEvalKey(orgId!, key, vault);
  console.log(`Key: Vault ${vault.pathPrefix}/orgs/${orgId}/eval/service-account (created)`);
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
  await ensureKey(userId);
  await ensureGrant(userId);
  console.log("\nTenant eval identity ready.");
  console.log(`  org=${orgId}`);
  console.log(`  project=${projectId}`);
  console.log(`  key=Vault ${process.env.VAULT_PATH_PREFIX ?? "noname"}/orgs/${orgId}/eval/service-account`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
