/**
 * Provision the platform control-plane identities in ZITADEL.
 *
 * Creates (idempotently):
 *   - a dedicated platform org (unless PLATFORM_ORG_ID is set)
 *   - a platform project with roles `platform_operator` and `eval_operator`
 *   - service accounts `release-operator`, `eval-runner` and `provisioner`
 *   - one JSON private key per service account, written under `zitadel_keys/`
 *   - one credential-lifecycle audit row per account, through the API (see `emitCredentialEvents`)
 *   - project role grants for each service account
 *
 * Run: pnpm init:platform-accounts
 * Requires: ZITADEL reachable + an admin credential (`ZITADEL_ADMIN_PAT` or the local login PAT).
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
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
  {
    /**
     * The provisioner is a *separate* identity from the credentials it creates, so the audit row for
     * "platform_operator granted to release-operator" names a principal, not the account that received the grant.
     * It holds the same role because it must be allowed to record credential events, nothing more.
     */
    userName: "provisioner",
    name: "Platform provisioner",
    description: "Provisioning identity (service account)",
    roleKey: "platform_operator",
    keyPath: "zitadel_keys/provisioner-sa.json",
    envKey: "PROVISIONER_KEY_PATH",
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

/**
 * Record what this run just changed in the platform audit stream.
 *
 * Attribution rule: a credential must not vouch for itself. When the provisioner key already existed, the events
 * are posted with the provisioner's own token, so the actor is a real principal. On the very first run the
 * provisioner is being created by this same run — there is no prior identity to name — so the events are marked
 * `actorType: system` and the reason says `bootstrap`.
 *
 * Best effort by design: provisioning has already happened, and failing the script afterwards would not undo it.
 * A miss is not silent — credential reconciliation reports it as `unrecorded`.
 */
async function emitCredentialEvents(input: {
  orgId: string;
  projectId: string;
  provisionerWasPresent: boolean;
}): Promise<void> {
  const keyPath = process.env.PROVISIONER_KEY_PATH?.trim() ?? "zitadel_keys/provisioner-sa.json";
  const issuer = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
  const apiBase = process.env.API_BASE?.trim() ?? "http://localhost:3000";
  const bootstrap = !input.provisionerWasPresent;

  try {
    const key = JSON.parse(readFileSync(join(ROOT, keyPath), "utf8")) as {
      keyId: string;
      userId: string;
      key: string;
    };
    const { createSign } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: key.keyId })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ iss: key.userId, sub: key.userId, aud: issuer, iat: now, exp: now + 600 }),
    ).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const assertion = `${header}.${payload}.${signer.sign(key.key, "base64url")}`;

    const tokenResponse = await fetch(`${issuer}/oauth/v2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
        scope: `openid profile urn:zitadel:iam:org:project:id:${input.projectId}:aud`,
      }),
    });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new Error(`token exchange failed (${tokenResponse.status})`);
    }
    const accessToken = token.access_token;

    for (const account of ACCOUNTS) {
      const userId = await ensureServiceAccount(adminPat(), input.orgId, account);
      for (const action of ["platform.credential.created", "platform.credential.granted"] as const) {
        // The API requires the edge attestation headers on every request (it refuses traffic that did not come
        // through the worker). Same shape the eval worker sends: HMAC over `org:user:role`.
        const secret = process.env.WORKER_SERVER_SECRET?.trim() ?? "";
        const hmac = createHmac("sha256", secret)
          .update(`${input.orgId}:${key.userId}:service`)
          .digest("base64");
        const response = await fetch(`${apiBase}/api/platform/credentials/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-org-id": input.orgId,
            "x-user-id": key.userId,
            "x-role": "service",
            "x-auth-hmac": hmac,
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action,
            accountId: userId,
            accountName: account.userName,
            role: account.roleKey,
            projectId: input.projectId,
            ...(bootstrap ? { actorType: "system", reason: "bootstrap" } : {}),
          }),
        });
        if (!response.ok) {
          console.warn(
            `credential audit: ${action} for ${account.userName} failed (${response.status}) — reconcile will report it`,
          );
        }
      }
    }
    console.log(
      `Credential audit: recorded as ${bootstrap ? "system (bootstrap)" : "provisioner"}.`,
    );
  } catch (error) {
    console.warn(
      `credential audit: could not record (${error instanceof Error ? error.message : String(error)}) — run reconciliation`,
    );
  }
}

async function main(): Promise<void> {
  const pat = adminPat();
  const orgId = await ensurePlatformOrg(pat);
  const projectId = await ensurePlatformProject(pat, orgId);
  await ensureRoles(pat, orgId, projectId);

  const provisionerWasPresent = existsSync(
    join(ROOT, process.env.PROVISIONER_KEY_PATH?.trim() ?? "zitadel_keys/provisioner-sa.json"),
  );

  for (const account of ACCOUNTS) {
    const userId = await ensureServiceAccount(pat, orgId, account);
    await ensureKey(pat, orgId, userId, account);
    await ensureGrant(pat, orgId, userId, projectId, account.roleKey);
  }

  await emitCredentialEvents({ orgId, projectId, provisionerWasPresent });

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
