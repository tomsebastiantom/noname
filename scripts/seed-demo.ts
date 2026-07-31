/**
 * Seeds a minimal platform demo: published "home" layout using core components only.
 * Run with API server up: pnpm seed:demo
 * Requires: pnpm init:zitadel (sets ZITADEL org id as org_id)
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID ?? "";
const DEMO_STORE_SLUG = "yogastore";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

const loginSpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: {
        layout: "centered",
        brandTitle: "Noname",
        brandSubtitle: "Platform demo",
      },
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: {
        title: "Welcome back",
        subtitle: "Sign in to continue",
        redirectPath: "/",
        logoUrl: null,
        showPasswordToggle: true,
        footerText: null,
        providers: ["google"],
      },
    },
  },
};

const demoSpec = {
  root: "main",
  elements: {
    main: {
      type: "Stack",
      props: { direction: "column", gap: 24, align: "stretch" },
      children: ["header", "promo", "intro", "actions"],
    },
    promo: {
      type: "Text",
      visible: { $state: "/flags/show_summer_sale" },
      props: {
        value: "Summer sale — 20% off yoga mats this week!",
        variant: "h3",
        align: "center",
      },
    },
    header: {
      type: "Text",
      props: { value: "Welcome to Noname", variant: "h1", align: "center" },
    },
    intro: {
      type: "Text",
      props: {
        value: "Platform demo — core layout components only. Enable an extension via catalog manifest for domain-specific UI.",
        variant: "body",
        align: "center",
      },
    },
    actions: {
      type: "Stack",
      props: { direction: "row", gap: 12, align: "center" },
      children: ["cta"],
    },
    cta: {
      type: "Button",
      props: { label: "Get started", variant: "primary", action: null },
    },
  },
};

const adminShellNavProps = {
  sidebarTitle: "Admin",
  productName: "Noname",
  navItems: [
    { id: "home", label: "Overview", href: "/admin" },
    { id: "pages", label: "Pages", href: "/admin/pages" },
    { id: "content", label: "Content", href: "/admin/content" },
    { id: "layout", label: "Layouts", href: "/admin/layout" },
  ],
  settingsSectionLabel: "Settings",
  settingsItems: [
    { id: "auth", label: "Auth settings", href: "/admin/settings/auth" },
    { id: "users", label: "Team members", href: "/admin/settings/users" },
    { id: "flags", label: "Feature flags", href: "/admin/settings/flags" },
    { id: "replay", label: "Session replay", href: "/admin/settings/replay" },
    { id: "login", label: "Login appearance", href: "/admin/settings/login" },
  ],
  accountSecurityLabel: "Account security",
  accountSecurityHref: "/account/security",
  storefrontLabel: "← Site",
  storefrontHref: "/",
  signOutLabel: "Sign out",
  signInLabel: "Sign in",
};

const draftPublishLabels = {
  saveLabel: "Save draft",
  savingLabel: "Saving…",
  publishLabel: "Save & publish",
  publishingLabel: "Publishing…",
};

const mediaFieldLabels = {
  uploadFileLabel: "Upload file",
  uploadingLabel: "Uploading…",
  pickExistingLabel: "Pick existing",
  loadingAssetsLabel: "Loading…",
  clearLabel: "Clear",
};

const authSettingsLabels = {
  saveLabel: "Save settings",
  savingLabel: "Saving…",
  loadingLabel: "Loading auth settings…",
  successMessage: "Auth settings saved.",
  socialProvidersLegend: "Social providers",
  configuredBadgeLabel: "Configured in ZITADEL",
  saveHelperText:
    "Save registers providers in ZITADEL for this org and stores IdP references in platform settings. Secrets are never returned to the browser after save.",
  authProvidersLinkText:
    "Manage provider enable, button label, and icon in Content → auth_provider.",
  allowPasswordLabel: "Allow email and password sign-in",
  allowPasswordResetLabel: "Allow forgot-password reset emails",
  allowSignUpLabel: "Allow customers to create accounts on /login",
  adminSecurityLegend: "Admin security",
  requireMfaLabel: "Require authenticator app (MFA) for admin access",
  mfaHelperText:
    "When enabled, team members must enroll at Account security before using /admin.",
  loginAppearanceLinkText: "Edit login appearance — title, logo, and brand copy on /login.",
  googleLabel: "Google",
  githubLabel: "GitHub",
  appleLabel: "Apple",
  googleSecretPlaceholderNew: "From Google Cloud Console",
  googleSecretPlaceholderExisting: "Leave blank to keep existing secret",
  githubSecretPlaceholderNew: "From GitHub OAuth app",
  githubSecretPlaceholderExisting: "Leave blank to keep existing secret",
  appleKeyPlaceholderNew: "Paste contents of AuthKey_XXXX.p8",
  appleKeyPlaceholderExisting: "Leave blank to keep existing key",
};

const usersAdminLabels = {
  loadingLabel: "Loading team members…",
  inviteSectionTitle: "Invite team member",
  inviteSectionDescription:
    "Creates a ZITADEL user in this org and emails them a link to set their password.",
  inviteLabel: "Send invite",
  invitingLabel: "Sending invite…",
  inviteSuccessMessage: "Invite sent — they will receive an email to set their password.",
  roleUpdatedMessage: "Role updated.",
  emptyTableMessage: "No team members yet.",
  emailColumnHeader: "Email",
  roleColumnHeader: "Role",
  mfaColumnHeader: "MFA",
  statusColumnHeader: "Status",
  mfaEnabledLabel: "Enabled",
  mfaOffLabel: "Off",
};

const sessionReplayAdminLabels = {
  loadingLabel: "Loading replay sessions…",
  emptyLabel: "No replay sessions yet. Browse the storefront with replay enabled to record sessions.",
  sessionColumnHeader: "Session",
  chunksColumnHeader: "Chunks",
  lastSeenColumnHeader: "Last activity",
  previewTitle: "Session detail",
  previewLoadingLabel: "Loading chunk…",
  loadChunkLabel: "Load chunk",
  playSessionLabel: "Play session",
  playerLoadingLabel: "Loading replay…",
  forbiddenLabel: "Session replay is available to org admins only.",
  noChunksLabel: "No stored chunks for this session.",
};

const loginBrandingLabels = {
  ...draftPublishLabels,
  previewLoginLabel: "Preview login",
  draftSavedMessage: "Login appearance saved as draft.",
  publishedMessage: "Login appearance published.",
  loadingLabel: "Loading login layout…",
};

const contentAdminLabels = {
  ...draftPublishLabels,
  ...mediaFieldLabels,
  deleteLabel: "Delete",
  deletingLabel: "Deleting…",
  createDraftLabel: "Create draft",
  creatingLabel: "Creating…",
  loadingLabel: "Loading content…",
  entryCreatedMessage: "Entry created as draft.",
  entrySavedMessage: "Entry saved as draft.",
  entryPublishedMessage: "Entry published.",
  entryDeletedMessage: "Entry deleted.",
  deleteConfirmMessage: "Delete this entry? This cannot be undone.",
};

const layoutAdminLabels = {
  ...draftPublishLabels,
  loadingLabel: "Loading layouts…",
  draftSavedMessage: "Layout saved as draft.",
  publishedMessage: "Layout published. Site and login will use the new spec on next load.",
};

const pagesAdminLabels = {
  saveLabel: "Save",
  savingLabel: "Saving…",
  pageSavedMessage: "Page document saved.",
  createLabel: "Create",
  creatingLabel: "Creating…",
  loadingLabel: "Loading pages…",
  editUrlTreeLabel: "Edit URL tree →",
  allPagesLinkLabel: "← All pages",
  urlTreeLinkLabel: "URL tree",
  saveTreeLabel: "Save page tree",
  savingTreeLabel: "Saving…",
  treeSavedMessage: "Page tree saved.",
  addEntryLabel: "Add entry",
  removeEntryLabel: "Remove entry",
  pageDocumentsLinkLabel: "← Page documents",
  treeLoadingLabel: "Loading page tree…",
};

const adminHomeLinks = [
  {
    href: "/admin/pages",
    label: "Pages",
    description: "URL tree and routing page documents",
  },
  {
    href: "/admin/content/auth_provider",
    label: "Identity providers",
    description: "Custom OAuth/OIDC providers (schema-driven CMS entries)",
  },
  {
    href: "/admin/layout",
    label: "Layouts",
    description: "Edit json-render templates (home, login, …)",
  },
  {
    href: "/admin/settings/users",
    label: "Team members",
    description: "Invite staff, assign admin/editor roles, view MFA status",
  },
  {
    href: "/admin/settings/flags",
    label: "Feature flags",
    description: "Toggle storefront features live (SSE + json-render)",
  },
  {
    href: "/admin/settings/replay",
    label: "Session replay",
    description: "Browse recorded browser sessions for this org (admin only)",
  },
  {
    href: "/admin/settings/auth",
    label: "Auth settings",
    description: "Social login (Google, GitHub, Apple) and password toggle",
  },
  {
    href: "/account/security",
    label: "Account security",
    description: "Set up authenticator app (two-factor sign-in)",
  },
  {
    href: "/admin/settings/login",
    label: "Login appearance",
    description: "Title, logo, and brand copy on /login",
  },
];

function adminShellProps(
  activeNav: string,
  title: string,
  description?: string,
): Record<string, unknown> {
  return {
    ...adminShellNavProps,
    activeNav,
    title,
    ...(description !== undefined ? { description } : {}),
  };
}

const adminDashboardSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps(
        "auth",
        "Auth settings",
        "Social providers, password login, sign-up, MFA policy, and reset flags.",
      ),
      children: ["authSettings"],
    },
    authSettings: {
      type: "AuthSettingsForm",
      props: {
        title: "Sign-in methods",
        description:
          "Enable Google, GitHub, or Apple sign-in. Save registers IdPs in ZITADEL and updates platform settings for this org.",
        ...authSettingsLabels,
      },
    },
  },
};

const featureFlagsAdminLabels = {
  loadingLabel: "Loading flags…",
  emptyLabel: "No flags yet.",
  onLabel: "On",
  offLabel: "Off",
  togglingLabel: "Saving…",
};

const adminFlagsSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps(
        "flags",
        "Feature flags",
        "Toggle flags live on the storefront — changes push via SSE.",
      ),
      children: ["flagsAdmin"],
    },
    flagsAdmin: {
      type: "FeatureFlagsAdmin",
      props: {
        title: "Feature flags",
        description: "Boolean flags update the site instantly. Layout-bound flags re-fetch the page.",
        ...featureFlagsAdminLabels,
      },
    },
  },
};

const adminReplaySpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps(
        "replay",
        "Session replay",
        "Recorded browser sessions for this org. Requires admin role — enforced by the API.",
      ),
      children: ["loadReplay", "replayAdmin"],
    },
    loadReplay: {
      type: "MountAction",
      props: { action: "listReplaySessions" },
    },
    replayAdmin: {
      type: "SessionReplayAdmin",
      props: {
        title: "Session replay",
        description:
          "Sessions are grouped from analytics chunks. Select a row to inspect stored rrweb events.",
        ...sessionReplayAdminLabels,
      },
    },
  },
};

const adminUsersSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps(
        "users",
        "Team members",
        "Invite staff and assign roles for this org.",
      ),
      children: ["loadTeam", "usersAdmin"],
    },
    loadTeam: {
      type: "MountAction",
      props: { action: "listTeamUsers" },
    },
    usersAdmin: {
      type: "UsersAdminForm",
      props: {
        title: "Team members",
        description:
          "Users live in ZITADEL for this org. Invites send a password-setup email. Roles are stored in platform settings.",
        ...usersAdminLabels,
      },
    },
  },
};

const adminLoginBrandingSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps(
        "login",
        "Login appearance",
        "Title, logo, and brand copy on the sign-in page.",
      ),
      children: ["loginBranding"],
    },
    loginBranding: {
      type: "LoginBrandingForm",
      props: {
        title: "Login appearance",
        description:
          "Edit title, logo, and brand copy on /login. Publish to update the live login page.",
        segment: "default",
        ...loginBrandingLabels,
      },
    },
  },
};

const accountSecuritySpec = {
  root: "page",
  elements: {
    page: {
      type: "AuthLayout",
      props: {
        layout: "centered",
        brandTitle: "Account security",
        brandSubtitle: "Protect your account",
      },
      children: ["security"],
    },
    security: {
      type: "AccountSecurityForm",
      props: {
        title: "Two-factor authentication",
        description: "Use an authenticator app for an extra sign-in step after your password.",
      },
    },
  },
};

const adminContentSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps("content", "Content"),
      children: ["contentAdmin"],
    },
    contentAdmin: {
      type: "ContentEntryAdmin",
      props: {
        title: "Content entries",
        description:
          "Pick a content type, edit entries, and publish. Fields come from the content type schema in documents.",
        locale: "en-US",
        ...contentAdminLabels,
      },
    },
  },
};

const adminLayoutSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps("layout", "Layouts"),
      children: ["layoutAdmin"],
    },
    layoutAdmin: {
      type: "LayoutEntryAdmin",
      props: {
        title: "Layout templates",
        description:
          "Edit json-render specs for home, login, and other templates. Publish to update the live site.",
        segment: "default",
        ...layoutAdminLabels,
      },
    },
  },
};

const adminHomeSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps("home", "Dashboard"),
      children: ["home"],
    },
    home: {
      type: "AdminHome",
      props: {
        title: "Dashboard",
        description: "Manage content, layouts, and auth without re-seeding.",
        links: adminHomeLinks,
      },
    },
  },
};

const adminPagesSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: adminShellProps("pages", "Pages"),
      children: ["loadPages", "pagesAdmin"],
    },
    loadPages: {
      type: "MountAction",
      props: { action: "listRoutingPages" },
    },
    pagesAdmin: {
      type: "PageRoutingAdmin",
      props: {
        title: "Pages",
        description:
          "Routing page documents (layout + contentRef) and the URL tree that maps paths to them.",
        locale: "en-US",
        ...pagesAdminLabels,
      },
    },
  },
};

const pageContentType = {
  fields: [
    { key: "title", type: "text", required: true, isLocalizable: true, label: "Title" },
    { key: "body", type: "longText", required: false, isLocalizable: true, label: "Body" },
  ],
};

const authProviderContentType = {
  fields: [
    { key: "name", type: "text", required: true, isLocalizable: false, label: "Display name" },
    {
      key: "provider_key",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Provider key (google, github, apple, or custom slug)",
    },
    {
      key: "enabled",
      type: "boolean",
      required: false,
      isLocalizable: false,
      label: "Show on login when credentials are configured",
    },
    {
      key: "icon",
      type: "media",
      required: false,
      isLocalizable: false,
      label: "Login button icon",
    },
    {
      key: "client_id",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Client ID (custom OAuth only)",
    },
    {
      key: "client_secret",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Client secret (custom OAuth only)",
    },
    {
      key: "authorization_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Authorization endpoint (custom OAuth only)",
    },
    {
      key: "token_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Token endpoint (custom OAuth only)",
    },
    {
      key: "user_endpoint",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "User info endpoint (custom OAuth only)",
    },
    {
      key: "scopes",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Scopes (comma-separated, custom OAuth only)",
    },
  ],
};

let seedAdminToken: string | null = null;

function orgHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": DEMO_ORG_ID,
  };
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
  const { findUserIdByEmail } = await import(
    "../packages/server/src/domains/auth/adapters/zitadel/users.ts"
  );
  const { upsertUserTeamRole } = await import(
    "../packages/server/src/domains/auth/adapters/zitadel/authorizations.ts"
  );

  const userId = await findUserIdByEmail(DEMO_ORG_ID, adminEmail);
  if (!userId) {
    console.warn(`Demo admin user ${adminEmail} not found in org — skip role grant`);
    return;
  }

  await upsertUserTeamRole(DEMO_ORG_ID, projectId, userId, "admin");
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
  const { randomBytes } = await import("node:crypto");
  const { loginWithCredentials } = await import(
    "../packages/server/src/domains/auth/adapters/zitadel/client.ts"
  );

  try {
    const result = await loginWithCredentials({
      orgId: DEMO_ORG_ID,
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  options?: { skipIfExists?: boolean },
): Promise<void> {
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
    await api("PUT", `/api/documents/layout/${existing.id}`, { spec });
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

async function main() {
  if (!DEMO_ORG_ID) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding demo org ${DEMO_ORG_ID} via ${API_BASE} ...`);

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    throw new Error("API server not reachable — start with: pnpm dev");
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

  await upsertLayout("home", demoSpec);
  await upsertLayout("login", loginSpec);
  await upsertLayout("admin_dashboard", adminDashboardSpec);
  await upsertLayout("admin_flags", adminFlagsSpec);
  await upsertLayout("admin_replay", adminReplaySpec);
  await upsertLayout("admin_users", adminUsersSpec);
  await upsertLayout("admin_login", adminLoginBrandingSpec);
  await upsertLayout("admin_content", adminContentSpec);
  await upsertLayout("admin_layout", adminLayoutSpec);
  await upsertLayout("admin_home", adminHomeSpec);
  await upsertLayout("admin_pages", adminPagesSpec);
  await upsertLayout("account_security", accountSecuritySpec);

  await ensurePageContentType();
  await ensureAuthProviderContentType();
  await ensureBuiltinAuthProviders({ googleEnabled: Boolean(googleIdpId) });
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

  console.log("Demo seed complete.");
  console.log(`  Org:     ${DEMO_ORG_ID}`);
  console.log(`  Slug:    yogastore`);
  console.log(`  Layout:  home + login + admin_home + admin_content + admin_layout + admin_pages + admin_dashboard + admin_replay`);
  console.log(`  Client:  http://yogastore.localhost:5173`);
  console.log(`  Login:   http://yogastore.localhost:5173/login`);
  console.log(`  Admin:   http://yogastore.localhost:5173/admin`);
  console.log(`  Content: http://yogastore.localhost:5173/admin/content`);
  console.log(`  IdPs:    http://yogastore.localhost:5173/admin/content/auth_provider`);
  console.log(`  Pages:   http://yogastore.localhost:5173/admin/pages`);
  console.log(`  Layouts: http://yogastore.localhost:5173/admin/layout`);
  console.log(`  Auth:    http://yogastore.localhost:5173/admin/settings/auth`);
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
    if (!hasIcon && iconField) {
      await api("PUT", "/api/documents/content-types/auth_provider", {
        schema: { fields: [...typeDef.schema.fields, iconField] },
      });
      console.log("auth_provider content type updated with icon field.");
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

  const headers: Record<string, string> = { "x-org-id": DEMO_ORG_ID };
  if (seedAdminToken) {
    headers.Authorization = `Bearer ${seedAdminToken}`;
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
