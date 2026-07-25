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
        brandSubtitle: "AI-native storefront platform",
      },
      children: ["form"],
    },
    form: {
      type: "LoginForm",
      props: {
        title: "Welcome back",
        subtitle: "Sign in to manage your store",
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
      children: ["header", "intro", "actions"],
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

const adminDashboardSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Auth settings",
        activeNav: "auth",
      },
      children: ["authSettings"],
    },
    authSettings: {
      type: "AuthSettingsForm",
      props: {
        title: "Sign-in methods",
        description:
          "Enable Google, GitHub, or Apple sign-in. Save registers IdPs in ZITADEL and updates platform settings for this org.",
      },
    },
  },
};

const adminLoginBrandingSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Login appearance",
        activeNav: "auth",
      },
      children: ["loginBranding"],
    },
    loginBranding: {
      type: "LoginBrandingForm",
      props: {
        title: "Login appearance",
        description:
          "Edit title, logo, and brand copy on /login. Publish to update the live login page.",
        segment: "default",
      },
    },
  },
};

const adminContentSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Content",
        activeNav: "content",
      },
      children: ["contentAdmin"],
    },
    contentAdmin: {
      type: "ContentEntryAdmin",
      props: {
        title: "Content entries",
        description:
          "Pick a content type, edit entries, and publish. Fields come from the content type schema in documents.",
        locale: "en-US",
      },
    },
  },
};

const adminLayoutSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Layouts",
        activeNav: "layout",
      },
      children: ["layoutAdmin"],
    },
    layoutAdmin: {
      type: "LayoutEntryAdmin",
      props: {
        title: "Layout templates",
        description:
          "Edit json-render specs for home, login, and other templates. Publish to update the live site.",
        segment: "default",
      },
    },
  },
};

const adminHomeSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Dashboard",
        activeNav: "home",
      },
      children: ["home"],
    },
    home: {
      type: "AdminHome",
      props: {
        title: "Dashboard",
        description: "Manage content, layouts, and auth without re-seeding.",
      },
    },
  },
};

const adminPagesSpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        title: "Pages",
        activeNav: "pages",
      },
      children: ["pagesAdmin"],
    },
    pagesAdmin: {
      type: "PageRoutingAdmin",
      props: {
        title: "Storefront pages",
        description:
          "Routing page documents (layout + contentRef) and the URL tree that maps paths to them.",
        locale: "en-US",
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
      label: "Provider key (slug)",
    },
    { key: "client_id", type: "text", required: true, isLocalizable: false, label: "Client ID" },
    {
      key: "client_secret",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Client secret",
    },
    {
      key: "authorization_endpoint",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Authorization endpoint",
    },
    {
      key: "token_endpoint",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Token endpoint",
    },
    {
      key: "user_endpoint",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "User info endpoint",
    },
    {
      key: "scopes",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Scopes (comma-separated)",
    },
    { key: "enabled", type: "boolean", required: false, isLocalizable: false, label: "Enabled" },
    {
      key: "icon",
      type: "media",
      required: false,
      isLocalizable: false,
      label: "Login button icon",
    },
  ],
};

function orgHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-org-id": DEMO_ORG_ID,
  };
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

async function main() {
  if (!DEMO_ORG_ID) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding demo org ${DEMO_ORG_ID} via ${API_BASE} ...`);

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    throw new Error("API server not reachable — start with: pnpm dev");
  }

  await api("PUT", "/api/documents/tenant_settings/default", {
    slug: "yogastore",
    locales: ["en-US"],
    defaultLocale: "en-US",
  });

  const googleIdpId = process.env.ZITADEL_GOOGLE_IDP_ID?.trim();
  if (googleIdpId) {
    await api("PUT", `/api/tenants/${DEMO_STORE_SLUG}/auth/config`, {
      providers: ["google"],
      idpIds: { google: googleIdpId },
      allowPassword: true,
    });
    console.log("Auth config: Google IdP stored in tenant_settings for demo org.");
  }

  await api("PUT", `/api/tenants/${DEMO_STORE_SLUG}/catalog`, {
    platform: { version: "1", hash: "demo" },
    extensions: [],
  });

  await upsertLayout("home", demoSpec, { skipIfExists: true });
  await upsertLayout("login", loginSpec);
  await upsertLayout("admin_dashboard", adminDashboardSpec);
  await upsertLayout("admin_login", adminLoginBrandingSpec);
  await upsertLayout("admin_content", adminContentSpec);
  await upsertLayout("admin_layout", adminLayoutSpec);
  await upsertLayout("admin_home", adminHomeSpec);
  await upsertLayout("admin_pages", adminPagesSpec);

  await ensurePageContentType();
  await ensureAuthProviderContentType();
  await ensureBuiltinProviderIcons();
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
  console.log(`  Layout:  home + login + admin_home + admin_content + admin_layout + admin_pages + admin_dashboard`);
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

  const res = await fetch(`${API_BASE}/api/documents/assets/upload`, {
    method: "POST",
    headers: { "x-org-id": DEMO_ORG_ID },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${fileName} → ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { data: UploadedAssetRow };
  return body.data;
}

async function ensureBuiltinProviderIcons(): Promise<void> {
  const iconFiles = {
    google: "google.svg",
    github: "github.svg",
    apple: "apple.svg",
  } as const;

  const providerIconAssets: Record<string, { documentId: string }> = {};
  for (const [provider, fileName] of Object.entries(iconFiles)) {
    const asset = await uploadIdpIcon(fileName);
    if (asset.id) providerIconAssets[provider] = { documentId: asset.id };
  }

  const { data: settings } = await api<{ data: { auth?: Record<string, unknown> } }>(
    "GET",
    "/api/documents/tenant_settings/default",
  );

  await api("PUT", "/api/documents/tenant_settings/default", {
    auth: {
      ...(settings.auth ?? {}),
      providerIconAssets: {
        ...((settings.auth?.providerIconAssets as
          | Record<string, { documentId: string }>
          | undefined) ?? {}),
        ...providerIconAssets,
      },
    },
  });
  console.log("Built-in IdP icon assets linked in tenant auth config.");
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
