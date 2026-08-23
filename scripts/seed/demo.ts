/**
 * Seeds a minimal platform demo: published layouts, admin UI, team users, Keto scope.
 * Run with API server up: pnpm seed:demo
 * Requires: pnpm init:zitadel (sets ZITADEL org id as org_id)
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { randomBytes, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findUserIdByEmail, loginWithCredentials, upsertUserTeamRole } from "../../packages/server/src/seed";
import { seedDemoTeamAndScope, subFromAccessToken } from "./demo-users";
import { seedOrgEditorAccess } from "./keto-tuples";
import { agentTaskCompleteEmailSpec, welcomeEmailSpec } from "./email-specs";
import {
  accountCommunicationPrefsSpec,
  accountNotificationsSpec,
  accountSecuritySpec,
  adminAccountSecuritySpec,
  adminAgentsSpec,
  adminAnalyticsSpec,
  adminContentSpec,
  adminDashboardSpec,
  adminFlagsSpec,
  adminHomeSpec,
  adminIntegrationsSpec,
  adminLayoutSpec,
  adminLoginBrandingSpec,
  adminPagesSpec,
  adminPagesTreeSpec,
  adminReplaySpec,
  adminScopeSpec,
  adminShellSpec,
  adminTracesSpec,
  adminUsersSpec,
  demoSpec,
  loginSpec,
  visualEditorShellSpec,
} from "./demo-specs";
import {
  authProviderContentType,
  editorPrefsContentType,
  notificationEmailContentType,
  pageContentType,
} from "./demo-content-types";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "../..");

/** Re-read .env on each seed run (picks up init:zitadel without restarting this process). */
function reloadSeedEnv(): void {
  loadEnv({ path: join(repoRoot, ".env"), override: true });
}

let demoOrgId = "";
const DEMO_STORE_SLUG = "yogastore";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

let seedAdminToken: string | null = null;

function signHmac(payload: string): string {
  const secret = process.env.WORKER_SERVER_SECRET || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64");
}

function orgHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": demoOrgId,
  };
  const userId = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const role = "admin";
  const payload = `${demoOrgId}:${userId}:${role}`;
  const hmac = signHmac(payload);
  if (hmac) {
    headers["x-user-id"] = userId;
    headers["x-role"] = role;
    headers["x-auth-hmac"] = hmac;
  }
  if (seedAdminToken) {
    headers.Authorization = `Bearer ${seedAdminToken}`;
  }
  return headers;
}

async function ensureDemoAdminRole(): Promise<void> {
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!projectId) {
    console.warn("ZITADEL_PROJECT_ID not set — skip admin role grant (run pnpm init:zitadel)");
    return;
  }

  const adminEmail = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";

  const userId = await findUserIdByEmail(demoOrgId, adminEmail);
  if (!userId) {
    console.warn(`Demo admin user ${adminEmail} not found in org — skip role grant`);
    return;
  }

  await upsertUserTeamRole(demoOrgId, projectId, userId, "admin");
  console.log(`Granted ZITADEL admin role to ${adminEmail}`);
}

async function obtainSeedAdminToken(): Promise<void> {
  const clientId = process.env.ZITADEL_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn("ZITADEL_CLIENT_ID not set — seed mutations need admin JWT (run pnpm init:zitadel)");
    return;
  }

  const email = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const password = process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!";
  const redirectUri = process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";

  try {
    const result = await loginWithCredentials({
      orgId: demoOrgId,
      email,
      password,
      clientId,
      redirectUri,
      codeVerifier: randomBytes(32).toString("base64url"),
    });
    if (result.status !== "success") {
      console.warn("Seed admin login requires MFA — complete MFA manually or disable for seed user");
      return;
    }
    seedAdminToken = result.accessToken;
    console.log(`Seed admin JWT obtained for ${email}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Could not obtain seed admin JWT: ${message}`);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: orgHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface LayoutRow {
  id: string;
  key: string;
  status: string;
}

async function upsertLayout(
  templateName: string,
  spec: Record<string, unknown>,
  options?: {
    skipIfExists?: boolean;
    renderAs?: "standalone" | "shell" | "panel" | "editor";
    shellRef?: string;
  },
): Promise<void> {
  const meta: Record<string, unknown> = {};
  if (options?.renderAs) {
    meta.renderAs = options.renderAs;
  }
  if (options?.shellRef) {
    meta.shellRef = options.shellRef;
  }

  const { data: layouts } = await api<{ data: LayoutRow[] }>(
    "GET",
    `/api/documents/layout?segment=default&templateName=${templateName}`,
  );
  const existing = layouts.find((row) => row.key === templateName);

  if (existing) {
    if (options?.skipIfExists) {
      console.log(`${templateName} layout already published — skipping create.`);
      return;
    }
    await api("PUT", `/api/documents/layout/${existing.id}`, { spec, ...meta });
    if (existing.status !== "published") {
      await api("PUT", `/api/documents/layout/${existing.id}/publish`);
    }
    console.log(`${templateName} layout updated.`);
    return;
  }

  const { data: created } = await api<{ data: { id: string } }>("POST", "/api/documents/layout", {
    templateName,
    segment: "default",
    spec,
    ...meta,
  });
  await api("PUT", `/api/documents/layout/${created.id}/publish`);
  console.log(`${templateName} layout created and published.`);
}

async function ensureDemoFlag(): Promise<void> {
  const { data: flags } = await api<{ data: Array<{ key: string }> }>("GET", "/api/flags");
  if (flags.some((f) => f.key === "show_summer_sale")) {
    console.log("show_summer_sale flag already exists — skipping create.");
    return;
  }
  await api("POST", "/api/flags", {
    key: "show_summer_sale",
    type: "boolean",
    description: "Show summer sale banner on storefront home",
    defaultValue: true,
  });
  console.log("show_summer_sale flag created.");
}

async function syncKetoOrgEditorAccess(): Promise<void> {
  if (!seedAdminToken) return;
  const adminSub = subFromAccessToken(seedAdminToken);
  if (!adminSub) return;

  try {
    await seedOrgEditorAccess({
      orgId: demoOrgId,
      editorSubs: [adminSub],
      orgHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Keto org editor seed failed: ${message}`);
    console.warn("Start Keto: podman compose up -d keto");
  }
}

async function main() {
  reloadSeedEnv();
  demoOrgId = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";

  if (!demoOrgId) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding demo org ${demoOrgId} via ${API_BASE} ...`);

  let health: Response;
  try {
    health = await fetch(`${API_BASE}/health`);
  } catch {
    throw new Error(`API server not reachable at ${API_BASE} — start with: pnpm dev`);
  }
  if (!health.ok) {
    throw new Error(`API server not healthy at ${API_BASE} — start with: pnpm dev`);
  }

  await ensureDemoAdminRole();
  await obtainSeedAdminToken();

  await ensureDemoFlag();

  await api("PUT", "/api/documents/tenant_settings/default", {
    slug: "yogastore",
    locales: ["en-US"],
    defaultLocale: "en-US",
  });

  const googleIdpId = process.env.ZITADEL_GOOGLE_IDP_ID?.trim();

  await api("PUT", `/api/tenants/${DEMO_STORE_SLUG}/catalog`, {
    platform: { version: "1", hash: "demo" },
    extensions: [],
  });

  await upsertLayout("admin_shell", adminShellSpec, { renderAs: "shell" });
  await upsertLayout("visual_editor", visualEditorShellSpec, { renderAs: "shell" });
  await upsertLayout("home", demoSpec, { renderAs: "standalone" });
  await upsertLayout("login", loginSpec, { renderAs: "standalone" });
  await upsertLayout("admin_dashboard", adminDashboardSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_integrations", adminIntegrationsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_flags", adminFlagsSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_traces", adminTracesSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_replay", adminReplaySpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_analytics", adminAnalyticsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_users", adminUsersSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_scope", adminScopeSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_agents", adminAgentsSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_login", adminLoginBrandingSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_content", adminContentSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_layout", adminLayoutSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_home", adminHomeSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_pages", adminPagesSpec, { renderAs: "panel", shellRef: "admin_shell" });
  await upsertLayout("admin_pages_tree", adminPagesTreeSpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("admin_account_security", adminAccountSecuritySpec, {
    renderAs: "panel",
    shellRef: "admin_shell",
  });
  await upsertLayout("account_security", accountSecuritySpec, { renderAs: "standalone" });
  await upsertLayout("account_notifications", accountNotificationsSpec, { renderAs: "standalone" });
  await upsertLayout("account_communication_preferences", accountCommunicationPrefsSpec, {
    renderAs: "standalone",
  });

  await ensurePageContentType();
  await ensureEditorPrefsContentType();
  await ensureNotificationEmailContentType();
  await ensureAuthProviderContentType();
  await ensureBuiltinAuthProviders({ googleEnabled: Boolean(googleIdpId) });
  await ensureNotificationEmailTemplates();
  if (googleIdpId) {
    await api("PUT", "/api/documents/tenant_settings/default", {
      auth: {
        idpIds: { google: googleIdpId },
        allowPassword: true,
      },
    });
    console.log("Auth config: Google IdP id stored in tenant_settings for demo org.");
  }
  const pageContentId = await ensureDemoPageEntry();
  await ensurePageRouting(pageContentId);

  const { data: schema } = await api<{ data: { layout: unknown } }>(
    "GET",
    `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/")}`,
  );

  if (!schema.layout) {
    throw new Error("Seed succeeded but edge schema returned no layout");
  }

  await syncKetoOrgEditorAccess();

  if (seedAdminToken) {
    const adminSub = subFromAccessToken(seedAdminToken);
    if (adminSub) {
      try {
        await seedDemoTeamAndScope({
          orgId: demoOrgId,
          adminSub,
          storeSlug: DEMO_STORE_SLUG,
          orgHeaders,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Demo team scope seed failed: ${message}`);
      }
    }
  }

  console.log("Demo seed complete.");
  console.log(`  Org:     ${demoOrgId}`);
  console.log(`  Slug:    yogastore`);
  console.log(`  Layout:  home + login + admin_home + admin_content + admin_layout + admin_pages + admin_pages_tree + admin_dashboard + admin_analytics + admin_replay + admin_traces`);
  console.log(`  Client:  http://yogastore.localhost:5173`);
  console.log(`  Login:   http://yogastore.localhost:5173/login`);
  console.log(`  Admin:   http://yogastore.localhost:5173/admin`);
  console.log(`  Content: http://yogastore.localhost:5173/admin/content`);
  console.log(`  IdPs:    http://yogastore.localhost:5173/admin/content/auth_provider`);
  console.log(`  Pages:   http://yogastore.localhost:5173/admin/pages`);
  console.log(`  Layouts: http://yogastore.localhost:5173/admin/layout`);
  console.log(`  Auth:    http://yogastore.localhost:5173/admin/settings/auth`);
  console.log(`  Access:  http://yogastore.localhost:5173/admin/settings/scope`);
  console.log(`  Team:    http://yogastore.localhost:5173/admin/users`);
}

async function ensureNotificationEmailContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "notification_email");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof notificationEmailContentType } }>(
      "GET",
      "/api/documents/content-types/notification_email",
    );
    const fieldKeys = new Set(typeDef.schema.fields.map((field) => field.key));
    const needsSync = !fieldKeys.has("spec") || fieldKeys.has("html_body");
    if (needsSync) {
      await api("PUT", "/api/documents/content-types/notification_email", {
        schema: notificationEmailContentType,
      });
      console.log("notification_email content type schema synced (json-render spec).");
    } else {
      console.log("notification_email content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "notification_email",
    schema: notificationEmailContentType,
  });
  console.log("notification_email content type created.");
}

async function ensureNotificationEmailTemplates(): Promise<void> {
  const templates = [
    {
      template_key: "agent-task-complete",
      subject: "Agent task complete",
      spec: agentTaskCompleteEmailSpec,
      category: "operational",
    },
    {
      template_key: "welcome",
      subject: "Welcome",
      spec: welcomeEmailSpec,
      category: "transactional",
    },
  ] as const;

  const { data: existing } = await api<{ data: ContentEntryRow[] }>(
    "GET",
    "/api/documents/notification_email",
  );

  for (const template of templates) {
    const row = existing.find(
      (entry) =>
        String(entry.data.template_key ?? "")
          .trim()
          .toLowerCase() === template.template_key,
    );

    if (row) {
      await api("PUT", `/api/documents/notification_email/${row.id}`, template);
      if (row.status !== "published") {
        await api("PUT", `/api/documents/notification_email/${row.id}/publish`);
      }
      console.log(`notification_email/${template.template_key} updated.`);
      continue;
    }

    const { data: created } = await api<{ data: { id: string } }>(
      "POST",
      "/api/documents/notification_email",
      template,
    );
    await api("PUT", `/api/documents/notification_email/${created.id}/publish`);
    console.log(`notification_email/${template.template_key} created and published.`);
  }
}

async function ensureAuthProviderContentType(): Promise<void> {
  const iconField = authProviderContentType.fields.find((f) => f.key === "icon");
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "auth_provider");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof authProviderContentType } }>(
      "GET",
      "/api/documents/content-types/auth_provider",
    );
    const hasIcon = typeDef.schema.fields.some((f) => f.key === "icon");
    const oauthOptional = ["client_id", "client_secret", "authorization_endpoint", "token_endpoint", "user_endpoint"].every(
      (key) => {
        const field = typeDef.schema.fields.find((f) => f.key === key);
        return !field || field.required === false;
      },
    );
    if ((!hasIcon && iconField) || !oauthOptional) {
      await api("PUT", "/api/documents/content-types/auth_provider", {
        schema: authProviderContentType,
      });
      console.log("auth_provider content type schema synced.");
    } else {
      console.log("auth_provider content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "auth_provider",
    schema: authProviderContentType,
  });
  console.log("auth_provider content type created.");
}

interface UploadedAssetRow {
  id: string;
  key: string;
}

async function uploadIdpIcon(fileName: string): Promise<UploadedAssetRow> {
  const filePath = join(scriptDir, "assets", "idp", fileName);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/svg+xml" }), fileName);

  const fullHeaders = orgHeaders();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(fullHeaders)) {
    if (k !== "Content-Type") headers[k] = v;
  }

  const res = await fetch(`${API_BASE}/api/documents/assets/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${fileName} → ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { data: UploadedAssetRow };
  return body.data;
}

async function ensureBuiltinAuthProviders(options: {
  googleEnabled: boolean;
}): Promise<void> {
  const builtins = [
    { key: "google", name: "Google", file: "google.svg", enabled: options.googleEnabled },
    { key: "github", name: "GitHub", file: "github.svg", enabled: false },
    { key: "apple", name: "Apple", file: "apple.svg", enabled: false },
  ] as const;

  const { data: existing } = await api<{ data: ContentEntryRow[] }>(
    "GET",
    "/api/documents/auth_provider",
  );

  for (const builtin of builtins) {
    const icon = await uploadIdpIcon(builtin.file);
    const payload = {
      name: builtin.name,
      provider_key: builtin.key,
      enabled: builtin.enabled,
      icon: icon.id ? { documentId: icon.id } : undefined,
    };

    const row = existing.find(
      (entry) => String(entry.data.provider_key ?? "").toLowerCase() === builtin.key,
    );

    if (row) {
      await api("PUT", `/api/documents/auth_provider/${row.id}`, payload);
      if (row.status !== "published") {
        await api("PUT", `/api/documents/auth_provider/${row.id}/publish`);
      }
      console.log(`auth_provider/${builtin.key} updated.`);
      continue;
    }

    const { data: created } = await api<{ data: { id: string } }>(
      "POST",
      "/api/documents/auth_provider",
      payload,
    );
    await api("PUT", `/api/documents/auth_provider/${created.id}/publish`);
    console.log(`auth_provider/${builtin.key} created and published.`);
  }
}

interface ContentEntryRow {
  id: string;
  status: string;
  data: Record<string, unknown>;
}

async function ensureEditorPrefsContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  const existing = types.find((t) => t.name === "editor_prefs");

  if (existing) {
    const { data: typeDef } = await api<{ data: { schema: typeof editorPrefsContentType } }>(
      "GET",
      "/api/documents/content-types/editor_prefs",
    );
    const fieldKeys = new Set(typeDef.schema.fields.map((field) => field.key));
    const needsSync =
      !fieldKeys.has("layout") ||
      !fieldKeys.has("layersTreeCollapsed") ||
      !fieldKeys.has("agentChatClearedAt");
    if (needsSync) {
      await api("PUT", "/api/documents/content-types/editor_prefs", {
        schema: editorPrefsContentType,
      });
      console.log("editor_prefs content type schema synced.");
    } else {
      console.log("editor_prefs content type already exists.");
    }
    return;
  }

  await api("POST", "/api/documents/content-types", {
    name: "editor_prefs",
    schema: editorPrefsContentType,
  });
  console.log("editor_prefs content type created.");
}

async function ensurePageContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  if (types.some((t) => t.name === "page")) {
    console.log("Page content type already exists.");
    return;
  }
  await api("POST", "/api/documents/content-types", { name: "page", schema: pageContentType });
  console.log("Page content type created.");
}

async function ensureDemoPageEntry(): Promise<string> {
  const { data: existing } = await api<{ data: { id: string; status: string }[] }>(
    "GET",
    "/api/documents/page",
  );
  const published = existing.find((row) => row.status === "published");
  if (published) {
    console.log("Demo page entry already published.");
    return published.id;
  }

  const { data: created } = await api<{ data: { id: string } }>(
    "POST",
    "/api/documents/page?locale=en-US",
    {
      title: "Welcome",
      body: "Edit this page in Admin → Content.",
    },
  );
  await api("PUT", `/api/documents/page/${created.id}/publish`);
  console.log(`Demo page entry published (${created.id}).`);
  return created.id;
}

async function ensurePageRouting(pageContentId: string): Promise<void> {
  await api("PUT", "/api/documents/page/home", {
    layoutRef: "home",
    contentRef: `page:${pageContentId}`,
  });
  await api("PUT", "/api/documents/page_tree/main", {
    pages: [
      {
        id: "home",
        slug: { "en-US": "/" },
        pageId: "home",
      },
    ],
  });
  console.log("Page routing seeded (page_tree → home → page content).");
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
