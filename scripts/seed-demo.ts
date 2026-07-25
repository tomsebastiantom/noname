/**
 * Seeds a minimal platform demo: published "home" layout using core components only.
 * Run with API server up: pnpm seed:demo
 * Requires: pnpm init:zitadel (sets ZITADEL org id as org_id)
 */
import "dotenv/config";

const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID ?? "";

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
    locales: ["en-US"],
    defaultLocale: "en-US",
  });

  await api("PUT", `/api/tenants/${DEMO_ORG_ID}/catalog`, {
    platform: { version: "1", hash: "demo" },
    extensions: [],
  });

  await upsertLayout("home", demoSpec, { skipIfExists: true });
  await upsertLayout("login", loginSpec);

  const { data: schema } = await api<{ data: { layout: unknown } }>(
    "GET",
    `/api/edge/schema/${DEMO_ORG_ID}?segment=default`,
  );

  if (!schema.layout) {
    throw new Error("Seed succeeded but edge schema returned no layout");
  }

  console.log("Demo seed complete.");
  console.log(`  Org:     ${DEMO_ORG_ID}`);
  console.log(`  Layout:  home + login (published, core components)`);
  console.log(`  Client:  http://${DEMO_ORG_ID}.localhost:5173`);
  console.log(`  Login:   http://${DEMO_ORG_ID}.localhost:5173/login`);
  console.log(`  Commerce demo: pnpm seed:demo:commerce`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
