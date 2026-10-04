import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ContentTypeDocumentService, DocumentStorage, TenantSettingsService } from "../ports";
import { createStorefrontContentRoutes } from "./storefront-content";

const PUBLIC_KEY = "store-key-for-org-1";

function createTestApp(options: { publishableKey?: string; records?: unknown[] } = {}) {
  const contentTypes = {
    get: vi.fn(async () => ({
      name: "product",
      schema: {
        fields: [
          {
            key: "title",
            type: "text",
            required: true,
            isLocalizable: true,
            label: "Title",
            permissions: { read: ["public"], write: [] },
          },
          {
            key: "price",
            type: "number",
            required: true,
            isLocalizable: false,
            label: "Price",
            permissions: { read: ["public"], write: [] },
          },
          {
            key: "internalCost",
            type: "number",
            required: false,
            isLocalizable: false,
            label: "Internal cost",
          },
        ],
      },
    })),
  } as unknown as ContentTypeDocumentService;
  const storage = {
    findCollectionIdBySlug: vi.fn(async (_orgId: string, slug: string) =>
      slug === "shoes" ? "collection-1" : null,
    ),
    listPublishedContent: vi.fn(async () => (options.records ?? []) as never),
  } as unknown as DocumentStorage;
  const tenantSettings = {
    get: vi.fn(async () => ({
      publishableKey: options.publishableKey ?? PUBLIC_KEY,
      locales: ["en-US", "fr-CA"],
      defaultLocale: "en-US",
    })),
  } as unknown as TenantSettingsService;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    await next();
  });
  app.route(
    "/api/storefront/content",
    createStorefrontContentRoutes({ contentTypes, storage, tenantSettings }),
  );
  return { app, contentTypes, storage, tenantSettings };
}

const record = {
  id: "product-1",
  orgId: "org-1",
  type: "product",
  status: "published",
  version: 8,
  meta: { searchText: "private indexed metadata" },
  data: {
    title: { "en-US": "Blue sneakers", "fr-CA": "Chaussures bleues" },
    price: 99.99,
    internalCost: 14,
  },
} as never;

describe("keyed storefront published-content API", () => {
  it("requires the tenant publishable key before listing content", async () => {
    const { app, storage } = createTestApp();
    const missing = await app.request("/api/storefront/content/product");
    const invalid = await app.request("/api/storefront/content/product", {
      headers: { "x-publishable-key": "another-tenant-key" },
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(storage.listPublishedContent).not.toHaveBeenCalled();
  });

  it("returns a narrow public projection and queries published tenant content with locale/search filters", async () => {
    const { app, storage } = createTestApp({ records: [record, { ...record, id: "product-2" }] });
    const response = await app.request(
      "/api/storefront/content/product?locale=fr-CA&q=chaussure&limit=1&offset=0",
      { headers: { "x-publishable-key": PUBLIC_KEY } },
    );
    const body = (await response.json()) as {
      data: {
        items: Array<{ id: string; data: Record<string, unknown> }>;
        locale: string;
        limit: number;
        offset: number;
        nextOffset: number | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      { id: "product-1", data: { title: "Chaussures bleues", price: 99.99 } },
    ]);
    expect(body.data).toMatchObject({ locale: "fr-CA", limit: 1, offset: 0, nextOffset: 1 });
    expect(JSON.stringify(body)).not.toContain("internalCost");
    expect(JSON.stringify(body)).not.toContain("private indexed metadata");
    expect(storage.listPublishedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        type: "product",
        locale: "fr-CA",
        defaultLocale: "en-US",
        query: "chaussure",
        limit: 2,
        offset: 0,
        searchFields: [
          { key: "title", isLocalizable: true },
          { key: "price", isLocalizable: false },
        ],
      }),
    );
  });

  it("uses only a tenant-resolved collection slug and falls back to the tenant default locale", async () => {
    const { app, storage } = createTestApp({ records: [record] });
    const response = await app.request(
      "/api/storefront/content/product?collection=shoes&locale=es-MX",
      { headers: { "x-publishable-key": PUBLIC_KEY } },
    );

    expect(response.status).toBe(200);
    expect(storage.findCollectionIdBySlug).toHaveBeenCalledWith("org-1", "shoes");
    expect(storage.listPublishedContent).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: "collection-1", locale: "en-US" }),
    );
  });

  it("bounds page size and rejects oversized search terms", async () => {
    const { app, storage } = createTestApp();
    const bounded = await app.request("/api/storefront/content/product?limit=9999&offset=-2", {
      headers: { "x-publishable-key": PUBLIC_KEY },
    });
    const rejected = await app.request(`/api/storefront/content/product?q=${"x".repeat(161)}`, {
      headers: { "x-publishable-key": PUBLIC_KEY },
    });

    expect(bounded.status).toBe(200);
    expect(storage.listPublishedContent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 101, offset: 0 }),
    );
    expect(rejected.status).toBe(400);
  });
});
