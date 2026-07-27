/**
 * Live permission smoke test against running API + edge.
 * Usage: tsx scripts/validate-permissions-live.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { loginWithCredentials } from "../packages/server/src/domains/auth/adapters/zitadel/client.ts";
import { upsertUserTeamRole } from "../packages/server/src/domains/auth/adapters/zitadel/authorizations.ts";
import { findUserIdByEmail, registerHumanUser } from "../packages/server/src/domains/auth/adapters/zitadel/users.ts";

const API = process.env.API_BASE?.trim() || "http://localhost:3000";
const EDGE = process.env.EDGE_BASE?.trim() || "http://localhost:8787";
const ORG_ID = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";
const PROJECT_ID = process.env.ZITADEL_PROJECT_ID?.trim() ?? "";
const CLIENT_ID = process.env.ZITADEL_CLIENT_ID?.trim() ?? "";
const SLUG = "yogastore";
const REDIRECT = process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";

const ADMIN_EMAIL = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
const ADMIN_PASSWORD = process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!";
const EDITOR_EMAIL = "editor-perm-test@yogastore.local";
const EDITOR_PASSWORD = "EditorTest1!";
const CUSTOMER_EMAIL = "customer-perm-test@yogastore.local";
const CUSTOMER_PASSWORD = "CustomerTest1!";

async function obtainToken(email: string, password: string): Promise<string> {
  const result = await loginWithCredentials({
    orgId: ORG_ID,
    email,
    password,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    codeVerifier: randomBytes(32).toString("base64url"),
  });
  if (result.status !== "success") {
    throw new Error(`Login for ${email} failed: ${result.status}`);
  }
  return result.accessToken;
}

async function ensureUser(
  email: string,
  password: string,
  role: "editor" | "customer",
): Promise<void> {
  let userId = await findUserIdByEmail(ORG_ID, email);
  if (!userId) {
    const created = await registerHumanUser(ORG_ID, {
      email,
      password,
      givenName: role,
      familyName: "perm-test",
    });
    userId = created.userId;
    console.log(`  registered ${email}`);
  }
  if (role !== "customer" && PROJECT_ID) {
    await upsertUserTeamRole(ORG_ID, PROJECT_ID, userId, role);
    console.log(`  granted ${role} to ${email}`);
  }
}

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "x-org-id": ORG_ID };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function edge(path: string, token: string | null, followRedirect = true): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${EDGE}${path}`, { headers, redirect: followRedirect ? "follow" : "manual" });
}

function pass(label: string): void {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, detail: string): never {
  console.error(`  ❌ ${label}: ${detail}`);
  process.exit(1);
}

async function expectStatus(res: Response, expected: number, label: string): Promise<void> {
  if (res.status === expected) pass(label);
  else {
    const text = await res.text();
    fail(label, `expected ${expected}, got ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function main(): Promise<void> {
  if (!ORG_ID || !CLIENT_ID) {
    throw new Error("Missing ZITADEL_DEMO_ORG_ID or ZITADEL_CLIENT_ID — run pnpm init:zitadel");
  }

  console.log("\n=== Permission live validation ===\n");

  console.log("Setup test users…");
  await ensureUser(EDITOR_EMAIL, EDITOR_PASSWORD, "editor");
  await ensureUser(CUSTOMER_EMAIL, CUSTOMER_PASSWORD, "customer");

  console.log("\nObtain JWTs…");
  const adminToken = await obtainToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  const editorToken = await obtainToken(EDITOR_EMAIL, EDITOR_PASSWORD);
  const customerToken = await obtainToken(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

  async function sessionRoles(token: string): Promise<string[]> {
    const res = await api("GET", `/api/tenants/${SLUG}/auth/session`, token);
    const body = (await res.json()) as { data?: { roles?: string[] } };
    return body.data?.roles ?? [];
  }

  const adminRoles = await sessionRoles(adminToken);
  const editorRoles = await sessionRoles(editorToken);
  console.log(`  admin roles: ${adminRoles.join(", ") || "(none)"}`);
  console.log(`  editor roles: ${editorRoles.join(", ") || "(none)"}`);

  if (!adminRoles.includes("admin")) fail("admin session", "missing admin role");
  if (!editorRoles.includes("editor")) fail("editor session", "missing editor role");

  console.log("\nSession permissions…");
  for (const [label, token] of [
    ["admin", adminToken],
    ["editor", editorToken],
    ["customer", customerToken],
  ] as const) {
    const res = await api("GET", `/api/tenants/${SLUG}/auth/session`, token);
    await expectStatus(res, 200, `${label} session`);
    const body = (await res.json()) as { data?: { permissions?: string[]; teamRole?: string } };
    const perms = body.data?.permissions ?? [];
    console.log(`    ${label} teamRole=${body.data?.teamRole ?? "null"} perms=${perms.length}`);
    if (label === "editor" && !perms.includes("content:draft_write")) {
      fail("editor session", "missing content:draft_write");
    }
    if (label === "editor" && perms.includes("content:publish")) {
      fail("editor session", "should not have content:publish");
    }
    if (label === "admin" && !perms.includes("content:publish")) {
      fail("admin session", "missing content:publish");
    }
  }

  console.log("\nDocuments API…");
  const { data: layouts } = (await (
    await api("GET", "/api/documents/layout?segment=default&templateName=store", adminToken)
  ).json()) as { data: { id: string }[] };
  const layoutId = layouts[0]?.id;
  if (!layoutId) fail("layout lookup", "no store layout found — run pnpm seed:demo");

  await expectStatus(
    await api("PUT", `/api/documents/layout/${layoutId}`, editorToken, {
      spec: { root: "main", elements: {} },
    }),
    200,
    "editor layout draft save",
  );
  await expectStatus(
    await api("PUT", `/api/documents/layout/${layoutId}/publish`, editorToken),
    403,
    "editor layout publish blocked",
  );
  await expectStatus(
    await api("PUT", `/api/documents/layout/${layoutId}/publish`, adminToken),
    200,
    "admin layout publish",
  );
  await expectStatus(
    await api("PUT", `/api/tenants/${SLUG}/auth/config`, editorToken, { requireMfaForAdmin: false }),
    403,
    "editor auth config blocked",
  );

  console.log("\nEdge ?edit=true gate…");
  await expectStatus(
    await edge(`/api/edge/schema/${SLUG}?segment=default&url=/&edit=true`, null, false),
    302,
    "anonymous edit=true → login redirect",
  );
  await expectStatus(
    await edge(`/api/edge/schema/${SLUG}?segment=default&url=/&edit=true`, customerToken),
    403,
    "customer edit=true → 403",
  );
  await expectStatus(
    await edge(`/api/edge/schema/${SLUG}?segment=default&url=/&edit=true`, editorToken),
    200,
    "editor edit=true → 200",
  );
  await expectStatus(
    await edge(`/api/edge/schema/${SLUG}?segment=default&url=/`, null),
    200,
    "anonymous normal schema → 200",
  );

  console.log("\n=== All permission checks passed ===\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
