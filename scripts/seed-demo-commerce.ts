/**
 * Optional commerce extension demo: enables commerce in catalog manifest,
 * publishes a storefront-style layout (Hero, ProductCard), and seeds cart machine.
 * Run after pnpm seed:demo with API server up: pnpm seed:demo:commerce
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID ?? "";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

const productContentType = {
  fields: [
    {
      key: "productId",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Product ID",
    },
    { key: "title", type: "text", required: true, isLocalizable: true, label: "Title" },
    { key: "price", type: "number", required: true, isLocalizable: false, label: "Price" },
    {
      key: "description",
      type: "longText",
      required: false,
      isLocalizable: true,
      label: "Description",
    },
    { key: "image", type: "text", required: false, isLocalizable: false, label: "Image URL" },
  ],
};

const commerceSpec = {
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
        subtitle: "Commerce extension demo layout",
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
        productId: { $state: "productId" },
        title: { $state: "title" },
        price: { $state: "price" },
        image: { $state: "image" },
        description: { $state: "description" },
      },
    },
  },
};

interface LayoutRow {
  id: string;
  key: string;
  status: string;
}

interface ContentEntryRow {
  id: string;
  type: string;
  status: string;
}

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

async function ensureProductContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>("GET", "/api/documents/content-types");
  if (types.some((t) => t.name === "product")) {
    console.log("Product content type already exists.");
    return;
  }
  await api("POST", "/api/documents/content-types", {
    name: "product",
    schema: productContentType,
  });
  console.log("Product content type created.");
}

async function seedDemoProduct(): Promise<string> {
  const { data: existing } = await api<{ data: ContentEntryRow[] }>("GET", "/api/documents/product");
  const published = existing.find((row) => row.status === "published");
  if (published) {
    console.log(`Demo product already published (${published.id}).`);
    return published.id;
  }

  const { data: created } = await api<{ data: { id: string } }>(
    "POST",
    "/api/documents/product?locale=en-US",
    {
      productId: "demo-sneakers",
      title: "Blue Sneakers",
      price: 99.99,
      description: "Comfortable running shoes for everyday wear.",
    },
  );
  await api("PUT", `/api/documents/product/${created.id}/publish`);
  console.log(`Demo product published (${created.id}).`);
  return created.id;
}

async function publishHomeLayout(spec: Record<string, unknown>, contentRef: string): Promise<void> {
  const { data: layouts } = await api<{ data: LayoutRow[] }>(
    "GET",
    "/api/documents/layout?segment=default&templateName=home",
  );
  const existing = layouts.find((row) => row.key === "home");

  if (existing) {
    await api("PUT", `/api/documents/layout/${existing.id}`, { spec, contentRef });
    if (existing.status !== "published") {
      await api("PUT", `/api/documents/layout/${existing.id}/publish`);
    }
    console.log("Home layout updated with commerce spec + contentRef.");
    return;
  }

  const { data: created } = await api<{ data: { id: string } }>("POST", "/api/documents/layout", {
    templateName: "home",
    segment: "default",
    spec,
  });
  await api("PUT", `/api/documents/layout/${created.id}`, { spec, contentRef });
  await api("PUT", `/api/documents/layout/${created.id}/publish`);
  console.log("Home layout created and published with contentRef.");
}

async function ensureCommercePageRouting(productId: string): Promise<void> {
  const productPath = "/products/demo-sneakers";
  await api("PUT", "/api/documents/page/product-demo", {
    layoutRef: "home",
    contentRef: `product:${productId}`,
  });

  const { data: tree } = await api<{ data: { pages: Array<{ id: string; slug: Record<string, string>; pageId: string }> } | null }>(
    "GET",
    "/api/documents/page_tree/main",
  );
  const pages = tree?.pages ?? [];
  const hasProduct = pages.some(
    (entry) =>
      entry.pageId === "product-demo" ||
      entry.slug["en-US"] === productPath ||
      Object.values(entry.slug).includes(productPath),
  );

  if (!hasProduct) {
    pages.push({
      id: "pg-product-demo",
      slug: { "en-US": productPath },
      pageId: "product-demo",
    });
  }

  await api("PUT", "/api/documents/page_tree/main", { pages });
  console.log(`Page routing: ${productPath} → product-demo → product:${productId}`);
}

async function main() {
  if (!DEMO_ORG_ID) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding commerce extension demo for org ${DEMO_ORG_ID} via ${API_BASE} ...`);

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    throw new Error("API server not reachable — start with: pnpm dev");
  }

  await api("PUT", `/api/tenants/${DEMO_ORG_ID}/catalog`, {
    platform: { version: "1", hash: "commerce-demo" },
    extensions: ["commerce"],
  });

  const cartDefinition = JSON.parse(
    readFileSync(join(ROOT, "packages/extensions/src/commerce/machines/cart.json"), "utf8"),
  ) as { name: string };
  await api("POST", "/api/machines/definitions", cartDefinition);
  console.log(`Cart machine definition seeded (${cartDefinition.name}).`);

  await ensureProductContentType();
  const productId = await seedDemoProduct();
  const contentRef = `product:${productId}`;

  await publishHomeLayout(commerceSpec, contentRef);
  await ensureCommercePageRouting(productId);

  const { data: schema } = await api<{ data: { layout: { elements?: Record<string, { props?: Record<string, unknown> }> } } }>(
    "GET",
    `/api/edge/schema/${DEMO_ORG_ID}?url=${encodeURIComponent("/products/demo-sneakers")}`,
  );

  const productProps = schema.layout?.elements?.product1?.props;
  if (!productProps || productProps.title !== "Blue Sneakers") {
    throw new Error(
      `Edge did not resolve product content — got title: ${String(productProps?.title ?? "missing")}`,
    );
  }

  console.log("Commerce extension demo seed complete.");
  console.log(`  Org:         ${DEMO_ORG_ID}`);
  console.log(`  Extensions:  commerce`);
  console.log(`  Content:     ${contentRef}`);
  console.log(`  Layout:      home (Hero + ProductCard with $state)`);
  console.log(`  URL:         /products/demo-sneakers (via page_tree)`);
  console.log(`  Client:      http://${DEMO_ORG_ID}.localhost:5173/products/demo-sneakers`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
