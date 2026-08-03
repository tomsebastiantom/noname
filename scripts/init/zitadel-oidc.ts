/**
 * Creates (or reuses) a ZITADEL OIDC SPA app for local dev and writes ZITADEL_CLIENT_ID,
 * ZITADEL_PROJECT_ID to .env and packages/workers/wrangler.toml.
 * Requires: podman compose up (ZITADEL healthy) + noname-backend machine key.
 *
 * Run: pnpm init:zitadel
 */
import "dotenv/config";
import { createSign } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT_NAME = "noname-dev";
const APP_NAME = "noname-client";
const PLATFORM_PROJECT_ROLES = [
  { roleKey: "admin", displayName: "Store admin", group: "Team" },
  { roleKey: "access_manager", displayName: "Access manager", group: "Team" },
  { roleKey: "publisher", displayName: "Publisher", group: "Team" },
  { roleKey: "editor", displayName: "Editor", group: "Team" },
  { roleKey: "analyst", displayName: "Analyst", group: "Team" },
  { roleKey: "replay_viewer", displayName: "Replay viewer", group: "Team" },
  { roleKey: "flags_manager", displayName: "Flags manager", group: "Team" },
  { roleKey: "trace_viewer", displayName: "Trace viewer", group: "Team" },
  { roleKey: "customer", displayName: "Customer", group: "Shopper" },
] as const;
const REDIRECT_URI = "http://localhost:5173/auth/callback";
const ACCESS_TOKEN_TYPE = "OIDC_TOKEN_TYPE_JWT";
const POST_LOGOUT_URI = "http://localhost:5173";

const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
const ENV_FILE = process.env.ENV_FILE ?? join(ROOT, ".env");
const LOCAL_KEY_PATH = join(ROOT, "zitadel_keys", "noname-backend-sa.json");
const LOCAL_PAT_PATH = join(ROOT, "zitadel_keys/login-client.pat");
const KEY_CANDIDATES = [process.env.ZITADEL_MACHINE_KEY_PATH, LOCAL_KEY_PATH].filter(
  (p): p is string => Boolean(p),
);

interface ServiceAccountKey {
  keyId: string;
  userId: string;
  key: string;
}

interface ZitadelProject {
  projectId: string;
  organizationId: string;
  name: string;
}

interface ZitadelAppSummary {
  id?: string;
  name: string;
  oidcConfig?: { clientId?: string };
}

async function waitForZitadel(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${ZITADEL_ISSUER}/.well-known/openid-configuration`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`ZITADEL not reachable at ${ZITADEL_ISSUER} — run: podman compose up -d`);
}

function readKeyFromVolume(): ServiceAccountKey {
  const commands = [
    "podman run --rm -v noname_zitadel_keys:/keys:ro alpine cat /keys/noname-backend-sa.json",
    "docker run --rm -v noname_zitadel_keys:/keys:ro alpine cat /keys/noname-backend-sa.json",
  ];

  for (const cmd of commands) {
    try {
      const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return JSON.parse(out) as ServiceAccountKey;
    } catch {
      // try next
    }
  }

  throw new Error(
    "Could not read noname-backend-sa.json — set ZITADEL_MACHINE_KEY_PATH or run podman compose up -d",
  );
}

function cacheKeyLocally(key: ServiceAccountKey): void {
  mkdirSync(dirname(LOCAL_KEY_PATH), { recursive: true });
  writeFileSync(LOCAL_KEY_PATH, JSON.stringify(key, null, 2));
}

function clearStaleLoginPat(): void {
  if (existsSync(LOCAL_PAT_PATH)) {
    unlinkSync(LOCAL_PAT_PATH);
    console.log("Removed stale login-client.pat (will recreate).");
  }
}

async function keyWorks(key: ServiceAccountKey): Promise<boolean> {
  try {
    await getAccessToken(key);
    return true;
  } catch {
    return false;
  }
}

/** Prefer a working key. After `compose down -v`, local cache is stale — refresh from volume. */
async function loadServiceAccountKey(): Promise<ServiceAccountKey> {
  const volumeKey = readKeyFromVolume();

  for (const path of KEY_CANDIDATES) {
    if (!existsSync(path)) continue;
    const cached = JSON.parse(readFileSync(path, "utf8")) as ServiceAccountKey;
    if (await keyWorks(cached)) {
      if (cached.keyId === volumeKey.keyId) {
        return cached;
      }
      console.warn("Local machine key does not match compose volume — refreshing cache.");
      clearStaleLoginPat();
      cacheKeyLocally(volumeKey);
      console.log(`Cached machine key → ${LOCAL_KEY_PATH}`);
      return volumeKey;
    }
    console.warn(`Stale ZITADEL machine key at ${path} — trying compose volume...`);
  }

  if (!(await keyWorks(volumeKey))) {
    throw new Error(
      "ZITADEL machine key from compose volume is not accepted yet — wait for ZITADEL (curl http://localhost:8080/.well-known/openid-configuration) then retry",
    );
  }

  clearStaleLoginPat();
  cacheKeyLocally(volumeKey);
  console.log(`Cached machine key → ${LOCAL_KEY_PATH}`);
  return volumeKey;
}

function signAssertion(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: sa.keyId })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.userId,
      sub: sa.userId,
      aud: ZITADEL_ISSUER,
      iat: now,
      exp: now + 300,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(input);
  sign.end();
  const signature = sign.sign(sa.key).toString("base64url");
  return `${input}.${signature}`;
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const res = await fetch(`${ZITADEL_ISSUER}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      scope: "openid urn:zitadel:iam:org:project:id:zitadel:aud",
      assertion: signAssertion(sa),
    }),
  });

  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`ZITADEL token request failed: ${body.error_description ?? res.status}`);
  }
  return body.access_token;
}

async function zitadelPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ZITADEL_ISSUER}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body),
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

  const err = parsed as { code?: string; message?: string };
  const noOp =
    err.message?.includes("No changes") ||
    err.code === "COMMAND-1m88i" ||
    err.code === "already_exists";
  if (!res.ok && !noOp) {
    throw new Error(`${path} → ${res.status}: ${err.message ?? text}`);
  }

  return parsed as T;
}

async function listProjects(token: string): Promise<ZitadelProject[]> {
  const data = await zitadelPost<{ projects?: ZitadelProject[] }>(
    token,
    "/zitadel.project.v2.ProjectService/ListProjects",
    { pagination: { limit: 100 } },
  );
  return data.projects ?? [];
}

async function ensureProject(token: string, organizationId: string): Promise<string> {
  const existing = (await listProjects(token)).find((p) => p.name === PROJECT_NAME);
  if (existing) return existing.projectId;

  const created = await zitadelPost<{ projectId?: string }>(
    token,
    "/zitadel.project.v2.ProjectService/CreateProject",
    {
      name: PROJECT_NAME,
      organizationId,
      projectRoleAssertion: true,
      authorizationRequired: false,
      projectAccessRequired: false,
    },
  );

  if (!created.projectId) {
    throw new Error("CreateProject succeeded but returned no projectId");
  }
  return created.projectId;
}

async function ensureProjectRoleAssertion(token: string, projectId: string): Promise<void> {
  await zitadelPost(token, "/zitadel.project.v2.ProjectService/UpdateProject", {
    projectId,
    projectRoleAssertion: true,
  });
  console.log("Project role assertion enabled (roles in JWT).");
}

async function ensurePlatformProjectRoles(token: string, projectId: string): Promise<void> {
  for (const role of PLATFORM_PROJECT_ROLES) {
    await zitadelPost(token, "/zitadel.project.v2.ProjectService/AddProjectRole", {
      projectId,
      roleKey: role.roleKey,
      displayName: role.displayName,
      group: role.group,
    });
  }
  console.log(`Platform roles ensured: ${PLATFORM_PROJECT_ROLES.map((r) => r.roleKey).join(", ")}`);
}

async function findApp(
  token: string,
  projectId: string,
): Promise<{ appId: string; clientId: string } | null> {
  const data = await zitadelPost<{ result?: ZitadelAppSummary[] }>(
    token,
    `/management/v1/projects/${projectId}/apps/_search`,
    { queries: [], limit: 100, offset: 0 },
  );

  const app = data.result?.find((a) => a.name === APP_NAME);
  if (!app?.id || !app.oidcConfig?.clientId) return null;
  return { appId: app.id, clientId: app.oidcConfig.clientId };
}

async function ensureOidcAppConfig(
  token: string,
  projectId: string,
  appId: string,
): Promise<void> {
  await zitadelPost(
    token,
    "/zitadel.application.v2.ApplicationService/UpdateApplication",
    {
      applicationId: appId,
      projectId,
      oidcConfiguration: {
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [POST_LOGOUT_URI],
        accessTokenType: ACCESS_TOKEN_TYPE,
      },
    },
  );
  console.log(`OIDC redirect URI → ${REDIRECT_URI}`);
  console.log(`OIDC access token type → ${ACCESS_TOKEN_TYPE}`);
}

async function createOidcApp(token: string, projectId: string): Promise<string> {
  const data = await zitadelPost<{ oidcConfiguration?: { clientId?: string } }>(
    token,
    "/zitadel.application.v2.ApplicationService/CreateApplication",
    {
      projectId,
      name: APP_NAME,
      oidcConfiguration: {
        redirectUris: [REDIRECT_URI],
        responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
        grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
        applicationType: "OIDC_APPLICATION_TYPE_USER_AGENT",
        authMethodType: "OIDC_AUTH_METHOD_TYPE_NONE",
        postLogoutRedirectUris: [POST_LOGOUT_URI],
        version: "OIDC_VERSION_1_0",
        developmentMode: true,
        accessTokenType: ACCESS_TOKEN_TYPE,
      },
    },
  );

  const clientId = data.oidcConfiguration?.clientId;
  if (!clientId) {
    throw new Error("CreateApplication succeeded but returned no clientId");
  }
  return clientId;
}

async function ensureLoginClient(token: string, sa: ServiceAccountKey): Promise<void> {
  await fetch(`${ZITADEL_ISSUER}/admin/v1/members/${sa.userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roles: ["IAM_OWNER", "IAM_LOGIN_CLIENT"] }),
  });

  const patPath = LOCAL_PAT_PATH;
  if (existsSync(patPath)) {
    console.log("Login client PAT already exists.");
    return;
  }

  const res = await fetch(`${ZITADEL_ISSUER}/management/v1/users/${sa.userId}/pats`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDate: "2029-01-01T00:00:00Z" }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error("Failed to create login client PAT");
  }

  mkdirSync(join(ROOT, "zitadel_keys"), { recursive: true });
  writeFileSync(patPath, body.token);
  console.log(`Login client PAT → ${patPath}`);
}

function upsertEnvVar(filePath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${line}\n`);
    return;
  }

  const content = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(filePath, pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`);
}

/** Keep packages/workers/wrangler.toml [vars] in sync after compose down -v + init:zitadel. */
function upsertWranglerVars(filePath: string, vars: Record<string, string>): boolean {
  if (!existsSync(filePath)) return false;

  let content = readFileSync(filePath, "utf8");
  let changed = false;

  for (const [key, value] of Object.entries(vars)) {
    const line = `${key} = "${value}"`;
    const pattern = new RegExp(`^${key} = .*$`, "m");
    if (pattern.test(content)) {
      const next = content.replace(pattern, line);
      if (next !== content) changed = true;
      content = next;
      continue;
    }

    const afterClientId = /^ZITADEL_CLIENT_ID = .*$/m;
    if (afterClientId.test(content)) {
      content = content.replace(afterClientId, (match) => `${match}\n${line}`);
    } else {
      content = content.replace(/^(\[vars\]\n)/m, `$1${line}\n`);
    }
    changed = true;
  }

  if (changed) writeFileSync(filePath, content);
  return changed;
}

async function main(): Promise<void> {
  console.log(`Initializing ZITADEL OIDC app via ${ZITADEL_ISSUER} ...`);
  await waitForZitadel();

  const sa = await loadServiceAccountKey();
  const token = await getAccessToken(sa);

  const projects = await listProjects(token);
  const organizationId = projects[0]?.organizationId;
  if (!organizationId) {
    throw new Error("No organization found in ZITADEL — is the instance initialized?");
  }

  const projectId = await ensureProject(token, organizationId);
  await ensureProjectRoleAssertion(token, projectId);
  await ensurePlatformProjectRoles(token, projectId);
  const existingApp = await findApp(token, projectId);
  let clientId = existingApp?.clientId ?? null;

  if (clientId && existingApp) {
    console.log(`OIDC app "${APP_NAME}" already exists — reusing client.`);
    await ensureOidcAppConfig(token, projectId, existingApp.appId);
  } else {
    clientId = await createOidcApp(token, projectId);
    console.log(`Created OIDC app "${APP_NAME}".`);
  }

  upsertEnvVar(ENV_FILE, "ZITADEL_ISSUER", ZITADEL_ISSUER);
  upsertEnvVar(ENV_FILE, "ZITADEL_CLIENT_ID", clientId);
  upsertEnvVar(ENV_FILE, "ZITADEL_PROJECT_ID", projectId);

  const wranglerPath = join(ROOT, "packages/workers/wrangler.toml");
  if (
    upsertWranglerVars(wranglerPath, {
      ZITADEL_CLIENT_ID: clientId,
      ZITADEL_PROJECT_ID: projectId,
    })
  ) {
    console.log(`Updated wrangler.toml → CLIENT_ID=${clientId}, PROJECT_ID=${projectId}`);
  }
  upsertEnvVar(ENV_FILE, "ZITADEL_DEMO_ORG_ID", organizationId);

  const oidcJsonPath = join(ROOT, "packages/client/public/oidc.json");
  mkdirSync(dirname(oidcJsonPath), { recursive: true });
  writeFileSync(
    oidcJsonPath,
    `${JSON.stringify({ issuer: ZITADEL_ISSUER, clientId, redirectUri: REDIRECT_URI }, null, 2)}\n`,
  );

  await ensureLoginClient(token, sa);

  console.log("ZITADEL OIDC init complete.");
  console.log(`  Org ID:    ${organizationId}  (ZITADEL_DEMO_ORG_ID in .env)`);
  console.log(`  Project:   ${PROJECT_NAME} (${projectId})`);
  console.log(`  App:       ${APP_NAME}`);
  console.log(`  Client ID: ${clientId}`);
  console.log(`  Redirect:  ${REDIRECT_URI}`);
  console.log(`  Updated:   ${ENV_FILE}`);
  console.log(`  Wrangler:  ${wranglerPath}`);
  console.log(`  OIDC JSON: ${oidcJsonPath}`);
  console.log(`  Login:     admin@zitadel.localhost / NonameAdmin1! (default instance admin)`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
