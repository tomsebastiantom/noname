/**
 * Provision the platform control-plane identities in ZITADEL.
 *
 * Creates (idempotently):
 *   - a dedicated platform org (unless PLATFORM_ORG_ID is set)
 *   - a platform project with roles `platform_operator` and `eval_operator`
 *   - service accounts `release-operator` and `eval-runner`
 *   - one JSON private key per service account, written under `zitadel_keys/`
 *   - project role grants for each service account
 *
 * Run: pnpm init:platform-accounts
 * Requires: ZITADEL reachable + an admin credential (`ZITADEL_ADMIN_PAT` or the local login PAT).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
const ENV_FILE = process.env.ENV_FILE ?? join(ROOT, ".env");
const PAT_PATH = join(ROOT, "zitadel_keys", "login-client.pat");

const PLATFORM_ORG_NAME = "noname-platform";
const PLATFORM_PROJECT_NAME = "noname-platform";
const KEY_EXPIRY = "2030-01-01T00:00:00Z";

const ROLES = [
  { roleKey: "platform_operator", displayName: "Platform release operator", group: "Platform" },
  { roleKey: "eval_operator", displayName: "Platform eval runner", group: "Platform" },
] as const;

const ACCOUNTS = [
  {
    userName: "release-operator",
    name: "Release operator",
    description: "Platform release waves (service account)",
    roleKey: "platform_operator",
    keyPath: "zitadel_keys/release-operator-sa.json",
    envKey: "RELEASE_OPERATOR_KEY_PATH",
  },
  {
    userName: "eval-runner",
    name: "Eval runner",
    description: "Platform eval worker (service account)",
    roleKey: "eval_operator",
    keyPath: "zitadel_keys/eval-runner-sa.json",
    envKey: "EVAL_RUNNER_KEY_PATH",
  },
] as const;

function adminPat(): string {
  const pat = process.env.ZITADEL_ADMIN_PAT?.trim() || (existsSync(PAT_PATH) ? readFileSync(PAT_PATH, "utf8").trim() : "");
  if (!pat) {
    throw new Error("ZITADEL_ADMIN_PAT is required (or run pnpm init:zitadel to create the local PAT)");
  }
  return pat;
}

async function api<T>(
  pat: string,
  method: string,
  path: string,
  body?: unknown,
  orgId?: string,
): Promise<T> {
  const response = await fetch(`${ISSUER}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(orgId ? { "x-zitadel-orgid": orgId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function upsertEnv(key: string, value: string): void {
  const line = `${key}=${value}`;
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, `${line}\n`);
    return;
  }
  const content = readFileSync(ENV_FILE, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(
    ENV_FILE,
    pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`,
  );
}

async function ensurePlatformOrg(pat: string): Promise<string> {
  const configured = process.env.PLATFORM_ORG_ID?.trim();
  if (configured) {
    console.log(`Platform org: ${configured} (from PLATFORM_ORG_ID)`);
    return configured;
  }

  const search = await api<{ result?: Array<{ id: string; name: string }> }>(
    pat,
    "POST",
    "/v2/organizations/_search",
    { queries: [], limit: 100 },
  );
  const existing = search.result?.find((org) => org.name === PLATFORM_ORG_NAME);
  if (existing) {
    console.log(`Platform org: ${existing.id} (reused)`);
    upsertEnv("PLATFORM_ORG_ID", existing.id);
    return existing.id;
  }

  const created = await api<{ organizationId: string }>(pat, "POST", "/v2/organizations", {
    name: PLATFORM_ORG_NAME,
  });
  console.log(`Platform org: ${created.organizationId} (created)`);
  upsertEnv("PLATFORM_ORG_ID", created.organizationId);
  return created.organizationId;
}

async function ensurePlatformProject(pat: string, orgId: string): Promise<string> {
  const configured = process.env.ZITADEL_PLATFORM_PROJECT_ID?.trim();
  if (configured) {
    console.log(`Platform project: ${configured} (from ZITADEL_PLATFORM_PROJECT_ID)`);
    return configured;
  }

  const search = await api<{ result?: Array<{ id: string; name: string }> }>(
    pat,
    "POST",
    "/management/v1/projects/_search",
    { queries: [], limit: 100 },
    orgId,
  );
  const existing = search.result?.find((project) => project.name === PLATFORM_PROJECT_NAME);
  if (existing) {
    console.log(`Platform project: ${existing.id} (reused)`);
    upsertEnv("ZITADEL_PLATFORM_PROJECT_ID", existing.id);
    return existing.id;
  }

  const created = await api<{ id: string }>(
    pat,
    "POST",
    "/management/v1/projects",
    { name: PLATFORM_PROJECT_NAME, projectRoleAssertion: true },
    orgId,
  );
  console.log(`Platform project: ${created.id} (created)`);
  upsertEnv("ZITADEL_PLATFORM_PROJECT_ID", created.id);
  return created.id;
}

async function ensureRoles(pat: string, orgId: string, projectId: string): Promise<void> {
  for (const role of ROLES) {
    try {
      await api(
        pat,
        "POST",
        `/management/v1/projects/${projectId}/roles`,
        { roleKey: role.roleKey, displayName: role.displayName, group: role.group },
        orgId,
      );
      console.log(`Role ${role.roleKey}: created`);
    } catch (error) {
      const message = (error as Error).message;
      if (/already exists|409/i.test(message)) {
        console.log(`Role ${role.roleKey}: exists`);
        continue;
      }
      throw error;
    }
  }
}

async function findMachineUser(pat: string, orgId: string, userName: string): Promise<string | null> {
  const search = await api<{ result?: Array<{ id: string; userName: string; machine?: unknown }> }>(
    pat,
    "POST",
    "/management/v1/users/_search",
    {
      queries: [
        {
          userNameQuery: { userName, method: "TEXT_QUERY_METHOD_EQUALS" },
        },
      ],
      limit: 1,
    },
    orgId,
  );
  const user = search.result?.find((entry) => entry.userName === userName && entry.machine);
  return user?.id ?? null;
}

async function ensureServiceAccount(
  pat: string,
  orgId: string,
  account: (typeof ACCOUNTS)[number],
): Promise<string> {
  const existing = await findMachineUser(pat, orgId, account.userName);
  if (existing) {
    console.log(`Service account ${account.userName}: ${existing} (reused)`);
    return existing;
  }

  const created = await api<{ userId: string }>(
    pat,
    "POST",
    "/management/v1/users/machine",
    {
      userName: account.userName,
      name: account.name,
      description: account.description,
      accessTokenType: "ACCESS_TOKEN_TYPE_JWT",
    },
    orgId,
  );
  console.log(`Service account ${account.userName}: ${created.userId} (created)`);
  return created.userId;
}

async function ensureKey(
  pat: string,
  orgId: string,
  userId: string,
  account: (typeof ACCOUNTS)[number],
): Promise<void> {
  const path = join(ROOT, account.keyPath);
  if (existsSync(path)) {
    console.log(`Key ${account.userName}: ${account.keyPath} (exists)`);
    upsertEnv(account.envKey, account.keyPath);
    return;
  }

  const created = await api<{ keyId: string; keyContent: string }>(
    pat,
    "POST",
    `/v2/users/${userId}/keys`,
    { type: "KEY_TYPE_JSON", expirationDate: KEY_EXPIRY },
    orgId,
  );

  // keyContent is base64 of the JSON key file; decode before writing.
  const decoded = Buffer.from(created.keyContent, "base64").toString("utf8");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(JSON.parse(decoded), null, 2)}\n`, { mode: 0o600 });
  console.log(`Key ${account.userName}: ${account.keyPath} (created)`);
  upsertEnv(account.envKey, account.keyPath);
}

async function ensureGrant(
  pat: string,
  orgId: string,
  userId: string,
  projectId: string,
  roleKey: string,
): Promise<void> {
  try {
    await api(
      pat,
      "POST",
      `/management/v1/users/${userId}/grants`,
      { projectId, roleKeys: [roleKey] },
      orgId,
    );
    console.log(`Grant ${roleKey}: created`);
  } catch (error) {
    const message = (error as Error).message;
    if (/already exists|409|Conflict/i.test(message)) {
      console.log(`Grant ${roleKey}: exists`);
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const pat = adminPat();
  const orgId = await ensurePlatformOrg(pat);
  const projectId = await ensurePlatformProject(pat, orgId);
  await ensureRoles(pat, orgId, projectId);

  for (const account of ACCOUNTS) {
    const userId = await ensureServiceAccount(pat, orgId, account);
    await ensureKey(pat, orgId, userId, account);
    await ensureGrant(pat, orgId, userId, projectId, account.roleKey);
  }

  console.log("\nPlatform identities ready.");
  console.log(`  PLATFORM_ORG_ID=${orgId}`);
  console.log(`  ZITADEL_PLATFORM_PROJECT_ID=${projectId}`);
  for (const account of ACCOUNTS) {
    console.log(`  ${account.envKey}=${account.keyPath}`);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
