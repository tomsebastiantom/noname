/**
 * Seeds a minimal demo tenant: published "store" layout for first render.
 * Run with API server up: pnpm seed:demo
 * Requires: pnpm init:zitadel (sets ZITADEL org id as org_id)
 */
import "dotenv/config";

const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID ?? "";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

const demoSpec = {
  root: "main",
  elements: {
    main: {
      type: "Stack",
      props: { direction: "column", gap: 24, align: "stretch" },
      children: ["hero", "products"],
    },
    hero: {
      type: "Hero",
      props: {
        title: "Welcome to Noname",
        subtitle: "AI-native storefront — demo layout",
        image: null,
        ctaLabel: "Explore",
        ctaAction: null,
      },
    },
    products: {
      type: "Grid",
      props: { columns: 2, gap: 16 },
      children: ["product1"],
    },
    product1: {
      type: "ProductCard",
      props: {
        title: "Blue Sneakers",
        price: 99.99,
        image: null,
        description: "Comfortable running shoes for everyday wear.",
      },
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

  const existing = await fetch(
    `${API_BASE}/api/documents/layout/store/resolve?segment=default`,
    { headers: orgHeaders() },
  );
  if (existing.ok) {
    console.log("Demo layout already published — skipping create.");
  } else {
    const { data: created } = await api<{ data: { id: string } }>("POST", "/api/documents/layout", {
      templateName: "store",
      segment: "default",
      spec: demoSpec,
    });
    await api("PUT", `/api/documents/layout/${created.id}/publish`);
  }

  const { data: schema } = await api<{ data: { layout: unknown } }>(
    "GET",
    `/api/edge/schema/${DEMO_ORG_ID}?segment=default`,
  );

  if (!schema.layout) {
    throw new Error("Seed succeeded but edge schema returned no layout");
  }

  console.log("Demo seed complete.");
  console.log(`  Org:     ${DEMO_ORG_ID}`);
  console.log(`  Layout:  store (published)`);
  console.log(`  Client:  http://${DEMO_ORG_ID}.localhost:5173`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
