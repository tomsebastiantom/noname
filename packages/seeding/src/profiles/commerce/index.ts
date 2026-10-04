/**
 * Optional commerce extension demo: enables commerce in catalog manifest,
 * publishes a storefront-style layout (Hero, ProductCard), and seeds cart machine.
 * Run after pnpm seed:demo with API server up: pnpm seed:demo:commerce
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvidencePostgresService } from "../../../../server/src/domains/evidence/adapters/postgres";
import { createDatabase } from "../../../../server/src/drizzle";
import { loginWithCredentials } from "../../../../server/src/seed";
import { seedDemoOrderEvidence as seedDemoOrderEvidenceThroughPort } from "../../../../verticals/src/commerce";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const DEMO_ORG_ID = process.env.ZITADEL_DEMO_ORG_ID ?? "";
const DEMO_STORE_SLUG = "yogastore";

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

const publicRead = { read: ["public"], write: [] };

const productContentType = {
  fields: [
    {
      key: "productId",
      type: "text",
      required: true,
      isLocalizable: false,
      label: "Product ID",
      permissions: publicRead,
    },
    {
      key: "title",
      type: "text",
      required: true,
      isLocalizable: true,
      label: "Title",
      permissions: publicRead,
    },
    {
      key: "price",
      type: "number",
      required: true,
      isLocalizable: false,
      label: "Price",
      permissions: publicRead,
    },
    {
      key: "description",
      type: "richText",
      required: false,
      isLocalizable: true,
      label: "Description",
      permissions: publicRead,
    },
    {
      key: "image",
      type: "text",
      required: false,
      isLocalizable: false,
      label: "Image URL",
      permissions: publicRead,
    },
  ],
};

function specProps<
  TConfig extends Record<string, unknown>,
  TLabels extends Record<string, unknown>,
>(config: TConfig, labels: TLabels) {
  return { ...config, ...labels };
}

const commerceSpec = {
  root: "main",
  elements: {
    main: {
      type: "StackBase",
      props: specProps({ direction: "column", gap: 24, align: "stretch" }, {}),
      children: ["hero", "intro", "products", "cart", "cartDrawer"],
    },
    hero: {
      type: "Hero",
      props: specProps(
        { image: null, ctaAction: null },
        {
          title: "Welcome to Noname",
          subtitle: "Commerce extension demo layout",
          ctaText: "Explore",
          imageAlt: null,
        },
      ),
    },
    intro: {
      type: "TextBase",
      props: specProps(
        { variant: "body", align: "center" },
        {
          content:
            "Click blocks in ?edit=true to change layout copy. Product fields edit in Content admin.",
        },
      ),
    },
    products: {
      type: "ProductGrid",
      props: specProps(
        { minColumnWidthPx: 260, gap: 20 },
        { title: "Featured products", description: null },
      ),
      children: ["product1"],
    },
    cart: {
      type: "CartSummary",
      props: specProps(
        {
          title: "Your cart",
          checkoutLabel: "Checkout",
          viewCartLabel: "View cart",
          hideCartLabel: "Hide cart",
          loadingLabel: "Loading cart…",
          emptyLabel: "Your cart is empty",
          itemLabel: "item",
          itemsLabel: "items",
          removeItemLabel: "Remove",
          decreaseQuantityLabel: "Decrease quantity",
          increaseQuantityLabel: "Increase quantity",
          priceUnavailableLabel: "Price unavailable",
          signInLabel: "Sign in",
          signInRequiredLabel: "Sign in to view your cart",
          paymentPendingLabel: "Payment processing",
          paymentSuccessLabel: "Payment successful",
          paymentFailedLabel: "Payment failed",
        },
        {},
      ),
    },
    cartDrawer: {
      type: "CartDrawer",
      props: {
        title: "Your cart",
        openLabel: "Open cart",
        closeLabel: "Close cart",
        loadingLabel: "Loading cart…",
        emptyLabel: "Your cart is empty",
        errorLabel: "Your cart could not be updated",
        subtotalLabel: "Subtotal",
        removeItemLabel: "Remove",
        decreaseQuantityLabel: "Decrease quantity",
        increaseQuantityLabel: "Increase quantity",
        checkoutLabel: "Checkout",
        priceUnavailableLabel: "Price unavailable",
        currency: "CAD",
      },
    },
    product1: {
      type: "ProductCard",
      props: specProps(
        {
          productId: { $state: "productId" },
          title: { $state: "title" },
          price: { $state: "price" },
          image: { $state: "image" },
          description: { $state: "description" },
        },
        {
          addToCart: "Add to Cart",
          adding: "Adding…",
          addedToCart: "Added to cart",
          addFailed: "Could not add to cart",
        },
      ),
    },
  },
};

const productDetailSpec = {
  root: "main",
  elements: {
    main: {
      type: "StackBase",
      props: { direction: "column", gap: 24, align: "stretch" },
      children: ["productInfo", "cart"],
    },
    productInfo: {
      type: "ProductInfo",
      props: {
        productId: { $state: "productId" },
        title: { $state: "title" },
        price: { $state: "price" },
        image: { $state: "image" },
        imageAlt: null,
        description: { $state: "description" },
        currency: "CAD",
        maxQuantity: 99,
        quantityLabel: "Quantity",
        decreaseQuantityLabel: "Decrease quantity",
        increaseQuantityLabel: "Increase quantity",
        addToCartLabel: "Add to Cart",
        addingLabel: "Adding…",
        addedToCartMessage: "Added to cart",
        addFailedMessage: "Could not add to cart",
      },
    },
    cart: {
      type: "CartSummary",
      props: {
        title: "Your cart",
        checkoutLabel: "Checkout",
        viewCartLabel: "View cart",
        hideCartLabel: "Hide cart",
        loadingLabel: "Loading cart…",
        emptyLabel: "Your cart is empty",
        itemLabel: "item",
        itemsLabel: "items",
        removeItemLabel: "Remove",
        decreaseQuantityLabel: "Decrease quantity",
        increaseQuantityLabel: "Increase quantity",
        priceUnavailableLabel: "Price unavailable",
        signInLabel: "Sign in",
        signInRequiredLabel: "Sign in to view your cart",
        paymentPendingLabel: "Payment processing",
        paymentSuccessLabel: "Payment successful",
        paymentFailedLabel: "Payment failed",
      },
    },
  },
};

const collectionSpec = {
  root: "main",
  elements: {
    main: {
      type: "StackBase",
      props: { direction: "column", gap: 20, align: "stretch" },
      children: ["collection", "pagination", "cartDrawer", "checkoutButton"],
    },
    collection: {
      type: "CollectionPage",
      props: {
        listingKey: "all-products",
        contentType: "product",
        collectionSlug: null,
        pageSize: 12,
        currency: "CAD",
        productIdField: "productId",
        titleField: "title",
        priceField: "price",
        imageField: "image",
        descriptionField: "description",
        title: "All products",
        loadingLabel: "Loading products…",
        emptyLabel: "No products found",
        errorLabel: "Products could not be loaded",
        priceUnavailableLabel: "Price unavailable",
        addToCartLabel: "Add to Cart",
        addingLabel: "Adding…",
        addedToCartMessage: "Added to cart",
        addFailedMessage: "Could not add to cart",
      },
    },
    pagination: {
      type: "Pagination",
      props: {
        listingKey: "all-products",
        previousLabel: "Previous",
        nextLabel: "Next",
        pageLabel: "Page",
      },
    },
    cartDrawer: {
      type: "CartDrawer",
      props: {
        title: "Your cart",
        openLabel: "Open cart",
        closeLabel: "Close cart",
        loadingLabel: "Loading cart…",
        emptyLabel: "Your cart is empty",
        errorLabel: "Your cart could not be updated",
        subtotalLabel: "Subtotal",
        removeItemLabel: "Remove",
        decreaseQuantityLabel: "Decrease quantity",
        increaseQuantityLabel: "Increase quantity",
        checkoutLabel: "Checkout",
        priceUnavailableLabel: "Price unavailable",
        currency: "CAD",
      },
    },
    checkoutButton: {
      type: "CheckoutButton",
      props: {
        checkoutLabel: "Continue to checkout",
        loadingLabel: "Preparing checkout…",
        errorLabel: "Could not start checkout",
        variant: "outline",
      },
    },
  },
};

const searchSpec = {
  root: "main",
  elements: {
    main: {
      type: "StackBase",
      props: { direction: "column", gap: 20, align: "stretch" },
      children: ["results", "pagination", "cartDrawer"],
    },
    results: {
      type: "SearchResults",
      props: {
        listingKey: "product-search",
        contentType: "product",
        collectionSlug: null,
        pageSize: 12,
        currency: "CAD",
        productIdField: "productId",
        titleField: "title",
        priceField: "price",
        imageField: "image",
        descriptionField: "description",
        title: "Search products",
        searchPlaceholder: "Search products",
        searchButtonLabel: "Search",
        loadingLabel: "Searching…",
        emptyLabel: "No products found",
        errorLabel: "Products could not be loaded",
        priceUnavailableLabel: "Price unavailable",
        addToCartLabel: "Add to Cart",
        addingLabel: "Adding…",
        addedToCartMessage: "Added to cart",
        addFailedMessage: "Could not add to cart",
      },
    },
    pagination: {
      type: "Pagination",
      props: {
        listingKey: "product-search",
        previousLabel: "Previous",
        nextLabel: "Next",
        pageLabel: "Page",
      },
    },
    cartDrawer: {
      type: "CartDrawer",
      props: {
        title: "Your cart",
        openLabel: "Open cart",
        closeLabel: "Close cart",
        loadingLabel: "Loading cart…",
        emptyLabel: "Your cart is empty",
        errorLabel: "Your cart could not be updated",
        subtotalLabel: "Subtotal",
        removeItemLabel: "Remove",
        decreaseQuantityLabel: "Decrease quantity",
        increaseQuantityLabel: "Increase quantity",
        checkoutLabel: "Checkout",
        priceUnavailableLabel: "Price unavailable",
        currency: "CAD",
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

function signHmac(payload: string): string {
  const secret = process.env.WORKER_SERVER_SECRET || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64");
}

function orgHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": DEMO_ORG_ID,
  };
  // Sign request with HMAC when WORKER_SERVER_SECRET is set (matches server middleware)
  const userId = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const role = "admin";
  const payload = `${DEMO_ORG_ID}:${userId}:${role}`;
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

let seedAdminToken: string | null = null;

async function obtainSeedAdminToken(): Promise<void> {
  const clientId = process.env.ZITADEL_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn(
      "ZITADEL_CLIENT_ID not set — seed mutations need admin JWT (run pnpm init:zitadel)",
    );
    return;
  }

  const email = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const password = process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!";
  const redirectUri =
    process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";

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
      console.warn(
        "Seed admin login requires MFA — complete MFA manually or disable for seed user",
      );
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

async function ensureProductContentType(): Promise<void> {
  const { data: types } = await api<{ data: { name: string }[] }>(
    "GET",
    "/api/documents/content-types",
  );
  if (types.some((t) => t.name === "product")) {
    await api("PUT", "/api/documents/content-types/product", { schema: productContentType });
    console.log("Product content type updated with public storefront fields.");
    return;
  }
  await api("POST", "/api/documents/content-types", {
    name: "product",
    schema: productContentType,
  });
  console.log("Product content type created with public storefront fields.");
}

const demoProductDescription = {
  nodeType: "document",
  content: [
    {
      nodeType: "paragraph",
      content: [
        { nodeType: "text", value: "Comfortable running shoes for ", marks: [] },
        { nodeType: "text", value: "everyday wear", marks: [{ type: "bold" }] },
        { nodeType: "text", value: ".", marks: [] },
      ],
    },
    {
      nodeType: "unordered-list",
      content: [
        {
          nodeType: "list-item",
          content: [{ nodeType: "text", value: "Lightweight mesh upper", marks: [] }],
        },
        {
          nodeType: "list-item",
          content: [{ nodeType: "text", value: "Cushioned sole", marks: [] }],
        },
      ],
    },
  ],
};

async function seedDemoProduct(): Promise<string> {
  const { data: existing } = await api<{ data: ContentEntryRow[] }>(
    "GET",
    "/api/documents/product",
  );
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
      description: demoProductDescription,
    },
  );
  await api("PUT", `/api/documents/product/${created.id}/publish`);
  console.log(`Demo product published (${created.id}).`);
  return created.id;
}

async function publishCommerceLayout(
  templateName: string,
  spec: Record<string, unknown>,
  contentRef: string | null,
): Promise<void> {
  const { data: layouts } = await api<{ data: LayoutRow[] }>(
    "GET",
    `/api/documents/layout?segment=default&templateName=${encodeURIComponent(templateName)}`,
  );
  const existing = layouts.find((row) => row.key === templateName);

  if (existing) {
    await api("PUT", `/api/documents/layout/${existing.id}`, {
      spec,
      contentRef,
      renderAs: "standalone",
    });
    if (existing.status !== "published") {
      await api("PUT", `/api/documents/layout/${existing.id}/publish`);
    }
    console.log(`${templateName} layout updated with commerce spec + contentRef.`);
    return;
  }

  const { data: created } = await api<{ data: { id: string } }>("POST", "/api/documents/layout", {
    templateName,
    segment: "default",
    spec,
    renderAs: "standalone",
  });
  await api("PUT", `/api/documents/layout/${created.id}`, { spec, contentRef });
  await api("PUT", `/api/documents/layout/${created.id}/publish`);
  console.log(`${templateName} layout created and published with contentRef.`);
}

async function ensureCommercePageRouting(productId: string): Promise<void> {
  const productPath = "/products/demo-sneakers";
  const productContentRef = `product:${productId}`;
  const routes = [
    {
      key: "product-demo",
      path: productPath,
      layoutRef: "product_detail",
      contentRef: productContentRef,
    },
    { key: "collection-all", path: "/collections/all", layoutRef: "collection", contentRef: null },
    { key: "product-search", path: "/search", layoutRef: "search", contentRef: null },
  ];

  // The home grid and detail page bind the demo product; collection/search pages load published content.
  await api("PUT", "/api/documents/page/home", {
    layoutRef: "home",
    contentRef: productContentRef,
  });
  for (const route of routes) {
    await api("PUT", `/api/documents/page/${route.key}`, {
      layoutRef: route.layoutRef,
      contentRef: route.contentRef,
    });
  }

  const { data: tree } = await api<{
    data: { pages: Array<{ id: string; slug: Record<string, string>; pageId: string }> } | null;
  }>("GET", "/api/documents/page_tree/main");
  const pages = tree?.pages ?? [];
  for (const route of routes) {
    const exists = pages.some(
      (entry) =>
        entry.pageId === route.key ||
        entry.slug["en-US"] === route.path ||
        Object.values(entry.slug).includes(route.path),
    );
    if (!exists) {
      pages.push({
        id: `pg-${route.key}`,
        slug: { "en-US": route.path },
        pageId: route.key,
      });
    }
  }

  await api("PUT", "/api/documents/page_tree/main", { pages });
  console.log(`Page routing: ${routes.map((route) => `${route.path} → ${route.key}`).join(", ")}`);
}

async function seedDemoOrderEvidence(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed demo order evidence");
  }
  const db = createDatabase(databaseUrl);
  await seedDemoOrderEvidenceThroughPort(createEvidencePostgresService(db), DEMO_ORG_ID);
  const client = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
  console.log("Demo order evidence seeded (demo-order-1001).");
}

async function runCommerceSeed() {
  if (!DEMO_ORG_ID) {
    throw new Error("ZITADEL_DEMO_ORG_ID is empty — run: pnpm init:zitadel");
  }

  console.log(`Seeding commerce extension demo for org ${DEMO_ORG_ID} via ${API_BASE} ...`);

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    throw new Error("API server not reachable — start with: pnpm dev");
  }

  await obtainSeedAdminToken();

  await api("PUT", `/api/tenants/${DEMO_STORE_SLUG}/catalog`, {
    platform: { version: "1", hash: "commerce-demo" },
    extensions: ["commerce"],
  });

  // Publishable key for anonymous storefront access (logged by fingerprint only).
  const { data: rotated } = await api<{ data: { publishableKey?: string } }>(
    "POST",
    `/api/tenants/${DEMO_STORE_SLUG}/publishable-key/rotate`,
    {},
  );
  const fingerprint = (rotated?.publishableKey ?? "").slice(0, 12);
  console.log(`Publishable key issued (fingerprint ${fingerprint}...).`);

  const cartDefinition = JSON.parse(
    readFileSync(join(ROOT, "packages/extensions/src/commerce/machines/cart.json"), "utf8"),
  ) as { name: string };
  await api("POST", "/api/machines/definitions", cartDefinition);
  console.log(`Cart machine definition seeded (${cartDefinition.name}).`);

  await ensureProductContentType();
  const productId = await seedDemoProduct();
  const contentRef = `product:${productId}`;
  const storefrontKey = rotated?.publishableKey;
  if (!storefrontKey) throw new Error("Publishable key was not returned by the tenant API");
  const catalogResponse = await fetch(`${API_BASE}/api/storefront/content/product?limit=10`, {
    headers: { ...orgHeaders(), "x-publishable-key": storefrontKey },
  });
  if (!catalogResponse.ok) {
    throw new Error(`Published storefront content fetch failed: ${catalogResponse.status}`);
  }
  const catalogBody = (await catalogResponse.json()) as {
    data?: { items?: Array<{ id: string; data: Record<string, unknown> }> };
  };
  if (
    !catalogBody.data?.items?.some(
      (item) => item.id === productId && item.data.productId === "demo-sneakers",
    )
  ) {
    throw new Error(
      "Published product was not returned by the generic storefront content endpoint",
    );
  }

  await publishCommerceLayout("home", commerceSpec, contentRef);
  await publishCommerceLayout("product_detail", productDetailSpec, contentRef);
  await publishCommerceLayout("collection", collectionSpec, null);
  await publishCommerceLayout("search", searchSpec, null);
  await ensureCommercePageRouting(productId);
  await seedDemoOrderEvidence();

  const { data: productSchema } = await api<{
    data: { layout: ResolvedLayout; templateName?: string };
  }>(
    "GET",
    `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/products/demo-sneakers")}`,
  );

  type ResolvedLayout = {
    elements?: Record<string, { type?: string; props?: Record<string, unknown> }>;
  };
  const assertProductData = (
    layout: ResolvedLayout | undefined,
    componentKey: string,
    componentName: string,
    label: string,
    url: string,
  ) => {
    const productProps = layout?.elements?.[componentKey]?.props;
    const title = productProps?.title;
    const price = productProps?.price;
    if (title !== "Blue Sneakers" || typeof price !== "number") {
      throw new Error(
        `${label} ${componentName} not resolved at ${url} — title: ${String(title ?? "missing")}, price: ${String(price ?? "missing")}`,
      );
    }
  };

  const { data: homeSchema } = await api<{
    data: { layout: ResolvedLayout };
  }>("GET", `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/")}`);
  assertProductData(homeSchema.layout, "product1", "ProductCard", "Home", "/");
  assertProductData(
    productSchema.layout,
    "productInfo",
    "ProductInfo",
    "Product",
    "/products/demo-sneakers",
  );
  if (productSchema.templateName !== "product_detail") {
    throw new Error(`Product route uses unexpected layout ${productSchema.templateName}`);
  }

  const [collectionSchema, searchSchema] = await Promise.all([
    api<{ data: { layout: ResolvedLayout; templateName: string } }>(
      "GET",
      `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/collections/all")}`,
    ),
    api<{ data: { layout: ResolvedLayout; templateName: string } }>(
      "GET",
      `/api/edge/schema/${DEMO_STORE_SLUG}?url=${encodeURIComponent("/search")}`,
    ),
  ]);
  if (
    collectionSchema.data.templateName !== "collection" ||
    collectionSchema.data.layout.elements?.collection?.type !== "CollectionPage"
  ) {
    throw new Error("Collection route did not resolve the published CollectionPage spec");
  }
  if (
    searchSchema.data.templateName !== "search" ||
    searchSchema.data.layout.elements?.results?.type !== "SearchResults"
  ) {
    throw new Error("Search route did not resolve the published SearchResults spec");
  }

  console.log("Commerce extension demo seed complete.");
  console.log(`  Org:         ${DEMO_ORG_ID}`);
  console.log(`  Extensions:  commerce`);
  console.log(`  Content:     ${contentRef}`);
  console.log(`  Layouts:     home, product_detail, collection, search`);
  console.log(`  URLs:        /products/demo-sneakers, /collections/all, /search`);
  console.log(`  Client:      http://yogastore.localhost:5173/products/demo-sneakers`);
}

export { runCommerceSeed };
