/**
 * Creates (or reuses) a ZITADEL OIDC SPA app for local dev and writes ZITADEL_CLIENT_ID to .env.
 * Requires: podman compose up (ZITADEL healthy) + noname-backend machine key.
 *
 * Run: pnpm init:zitadel
 */
import "dotenv/config";
import { createSign } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_NAME = "noname-dev";
const APP_NAME = "noname-client";
const REDIRECT_URI = "http://localhost:5173/callback";
const POST_LOGOUT_URI = "http://localhost:5173";

const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
const ENV_FILE = process.env.ENV_FILE ?? join(ROOT, ".env");
const KEY_CANDIDATES = [
  process.env.ZITADEL_MACHINE_KEY_PATH,
  join(ROOT, "zitadel_keys", "noname-backend-sa.json"),
].filter((p): p is string => Boolean(p));

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

function loadServiceAccountKey(): ServiceAccountKey {
  for (const path of KEY_CANDIDATES) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as ServiceAccountKey;
    }
  }

  const key = readKeyFromVolume();
  const localPath = join(ROOT, "zitadel_keys", "noname-backend-sa.json");
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, JSON.stringify(key, null, 2));
  console.log(`Cached machine key → ${localPath}`);
  return key;
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
  if (!res.ok && err.code !== "already_exists") {
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
      projectRoleAssertion: false,
      authorizationRequired: false,
      projectAccessRequired: false,
    },
  );

  if (!created.projectId) {
    throw new Error("CreateProject succeeded but returned no projectId");
  }
  return created.projectId;
}

async function findAppClientId(token: string, projectId: string): Promise<string | null> {
  const data = await zitadelPost<{ result?: ZitadelAppSummary[] }>(
    token,
    `/management/v1/projects/${projectId}/apps/_search`,
    { queries: [], limit: 100, offset: 0 },
  );

  const app = data.result?.find((a) => a.name === APP_NAME);
  return app?.oidcConfig?.clientId ?? null;
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
        accessTokenType: "OIDC_TOKEN_TYPE_BEARER",
      },
    },
  );

  const clientId = data.oidcConfiguration?.clientId;
  if (!clientId) {
    throw new Error("CreateApplication succeeded but returned no clientId");
  }
  return clientId;
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

async function main(): Promise<void> {
  console.log(`Initializing ZITADEL OIDC app via ${ZITADEL_ISSUER} ...`);
  await waitForZitadel();

  const sa = loadServiceAccountKey();
  const token = await getAccessToken(sa);

  const projects = await listProjects(token);
  const organizationId = projects[0]?.organizationId;
  if (!organizationId) {
    throw new Error("No organization found in ZITADEL — is the instance initialized?");
  }

  const projectId = await ensureProject(token, organizationId);
  let clientId = await findAppClientId(token, projectId);

  if (clientId) {
    console.log(`OIDC app "${APP_NAME}" already exists — reusing client.`);
  } else {
    clientId = await createOidcApp(token, projectId);
    console.log(`Created OIDC app "${APP_NAME}".`);
  }

  upsertEnvVar(ENV_FILE, "ZITADEL_ISSUER", ZITADEL_ISSUER);
  upsertEnvVar(ENV_FILE, "ZITADEL_CLIENT_ID", clientId);
  upsertEnvVar(ENV_FILE, "ZITADEL_DEMO_ORG_ID", organizationId);

  console.log("ZITADEL OIDC init complete.");
  console.log(`  Org ID:    ${organizationId}  (ZITADEL_DEMO_ORG_ID in .env)`);
  console.log(`  Project:   ${PROJECT_NAME} (${projectId})`);
  console.log(`  App:       ${APP_NAME}`);
  console.log(`  Client ID: ${clientId}`);
  console.log(`  Redirect:  ${REDIRECT_URI}`);
  console.log(`  Updated:   ${ENV_FILE}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
