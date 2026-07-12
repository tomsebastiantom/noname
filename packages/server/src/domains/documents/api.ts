import { Hono } from "hono";
import type { DocumentService, LayoutFilters } from "./ports";
import type { CreateLayoutInput } from "./ports";
import type { AssetBinaryStorage } from "./assets/binary";
import { getTenantId } from "../../shared/tenant";
import { created, deleted, notFound, ok } from "../../shared/respond";
import { processImage, sha256, createAssetStorage } from "./assets/binary";
import type { AssetVariant, UploadAssetInput } from "./ports";

export function createDocumentsRoutes(service: DocumentService, binary?: AssetBinaryStorage) {
  const routes = new Hono();
  const assetBinary = binary ?? createAssetStorage();
  const { contentTypes, tenantSettings, content, layout, assets, pages } = service;

  // -------------------------------------------------------------------------
  // Content type schema management.
  // -------------------------------------------------------------------------
  routes.post("/content-types", async (c) => {
    const tenantId = getTenantId(c);
    const { name, schema } = await c.req.json<{ name: string; schema: Record<string, unknown> }>();
    const createdType = await contentTypes.create(tenantId, name, schema as never);
    return created(c, createdType);
  });

  routes.get("/content-types", async (c) => {
    const tenantId = getTenantId(c);
    return ok(c, await contentTypes.list(tenantId));
  });

  routes.get("/content-types/:name", async (c) => {
    const tenantId = getTenantId(c);
    const found = await contentTypes.get(tenantId, c.req.param("name"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/content-types/:name", async (c) => {
    const tenantId = getTenantId(c);
    const { schema } = await c.req.json<{ schema: Record<string, unknown> }>();
    const updated = await contentTypes.update(tenantId, c.req.param("name"), schema as never);
    return ok(c, updated);
  });

  // -------------------------------------------------------------------------
  // Tenant settings (locales, SEO defaults, integrations).
  // -------------------------------------------------------------------------
  routes.get("/tenant_settings/default", async (c) => {
    const tenantId = getTenantId(c);
    return ok(c, await tenantSettings.get(tenantId));
  });

  routes.put("/tenant_settings/default", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<{
      locales?: string[];
      defaultLocale?: string;
      seo?: Record<string, unknown>;
      integrations?: Record<string, string | null>;
    }>();
    const upserted = await tenantSettings.upsert(tenantId, {
      locales: body.locales ?? ["en-US"],
      defaultLocale: body.defaultLocale ?? "en-US",
      seo: (body.seo ?? {}) as never,
      integrations: (body.integrations ?? {}) as never,
    });
    return ok(c, upserted);
  });

  // -------------------------------------------------------------------------
  // Assets — media upload + metadata (binary in R2 / pluggable storage).
  // -------------------------------------------------------------------------
  routes.post("/assets/upload", async (c) => {
    const tenantId = getTenantId(c);
    const form = await c.req.parseBody({ all: true });
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "missing 'file' field" }, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const hash = sha256(bytes);

    const existing = await assets.findByHash(tenantId, hash);
    if (existing) return ok(c, existing);

    const baseKey = `${tenantId}/${hash}/${sanitizeName(file.name)}`;
    const focalPoint = parseFocalPoint(form.focalPoint);

    let variants: Record<string, AssetVariant>;
    let width: number | null = null;
    let height: number | null = null;

    if (mimeType.startsWith("image/")) {
      const result = await processImage(assetBinary, baseKey, bytes, mimeType, focalPoint);
      variants = result.variants;
      width = result.width;
      height = result.height;
    } else {
      const url = await assetBinary.put(baseKey, bytes, mimeType);
      variants = { original: { url, width: null, height: null } };
    }

    const input: UploadAssetInput = {
      fileName: file.name,
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: baseKey,
      width,
      height,
      altText: asString(form.altText) ?? null,
      caption: asString(form.caption) ?? null,
      focalPoint,
      variants,
      hash,
    };
    const createdAsset = await assets.create(tenantId, input);
    return created(c, createdAsset);
  });

  routes.get("/assets", async (c) => {
    const tenantId = getTenantId(c);
    return ok(c, await assets.list(tenantId));
  });

  routes.get("/assets/:assetId", async (c) => {
    const tenantId = getTenantId(c);
    const found = await assets.get(tenantId, c.req.param("assetId"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/assets/:assetId", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<{
      altText?: string | null;
      caption?: string | null;
      focalPoint?: { x: number; y: number } | null;
    }>();
    const updated = await assets.update(tenantId, c.req.param("assetId"), body);
    return ok(c, updated);
  });

  routes.delete("/assets/:assetId", async (c) => {
    const tenantId = getTenantId(c);
    await assets.delete(tenantId, c.req.param("assetId"));
    return deleted(c);
  });

  routes.put("/assets/:assetId/publish", async (c) => {
    const tenantId = getTenantId(c);
    const published = await assets.publish(tenantId, c.req.param("assetId"));
    return ok(c, published);
  });

  // -------------------------------------------------------------------------
  // Layout — json-render templates with per-segment override variants.
  // -------------------------------------------------------------------------
  routes.post("/layout", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<CreateLayoutInput>();
    const createdLayout = await layout.create(tenantId, {
      templateName: body.templateName,
      segment: body.segment,
      spec: body.spec,
    });
    return created(c, createdLayout);
  });

  routes.get("/layout", async (c) => {
    const tenantId = getTenantId(c);
    return ok(c, await layout.list(tenantId, layoutFiltersFrom(c.req.query())));
  });

  routes.get("/layout/:id", async (c) => {
    const tenantId = getTenantId(c);
    const found = await layout.get(tenantId, c.req.param("id"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/layout/:id/publish", async (c) => {
    const tenantId = getTenantId(c);
    const published = await layout.publish(tenantId, c.req.param("id"));
    return ok(c, published);
  });

  routes.put("/layout/:id/archive", async (c) => {
    const tenantId = getTenantId(c);
    const archived = await layout.archive(tenantId, c.req.param("id"));
    return ok(c, archived);
  });

  routes.put("/layout/:id/variants", async (c) => {
    const tenantId = getTenantId(c);
    const { segment, overrides } = await c.req.json<{
      segment: string;
      overrides: Record<string, unknown>;
    }>();
    const variant = await layout.addVariant(tenantId, c.req.param("id"), segment, overrides);
    return created(c, variant);
  });

  routes.get("/layout/:templateName/resolve", async (c) => {
    const tenantId = getTenantId(c);
    const resolved = await layout.resolve(
      tenantId,
      c.req.param("templateName"),
      c.req.query("segment") || "default",
    );
    return resolved ? ok(c, resolved) : notFound(c);
  });

  // -------------------------------------------------------------------------
  // Page tree — URL routing layer.
  // -------------------------------------------------------------------------
  routes.get("/page_tree/resolve", async (c) => {
    const tenantId = getTenantId(c);
    const url = c.req.query("url");
    const locale = c.req.query("locale") || "en-US";
    if (!url) return c.json({ error: "missing ?url=" }, 400);
    const route = await pages.resolveByUrl(tenantId, url, locale);
    return route ? ok(c, route) : notFound(c);
  });

  // -------------------------------------------------------------------------
  // Generic content routes — one set, dispatched by content-type name.
  // (product, page, blog, faq, ... — any registered content type.)
  // -------------------------------------------------------------------------
  routes.post("/:type", async (c) => {
    const tenantId = getTenantId(c);
    const type = c.req.param("type");
    const body = await c.req.json<Record<string, unknown>>();
    const createdEntry = await content.create(tenantId, type, body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
    });
    return created(c, createdEntry);
  });

  routes.get("/:type", async (c) => {
    const tenantId = getTenantId(c);
    return ok(c, await content.findByType(tenantId, c.req.param("type")));
  });

  routes.get("/:type/:id", async (c) => {
    const tenantId = getTenantId(c);
    const { type: _type, id } = c.req.param();
    const found = await content.findById(tenantId, id, {
      role: c.req.query("role"),
    });
    return found ? ok(c, found) : notFound(c);
  });

  routes.get("/:type/:id/resolve", async (c) => {
    const tenantId = getTenantId(c);
    const { type, id } = c.req.param();
    const resolved = await content.resolve(tenantId, type, id, c.req.query("locale") || "en-US");
    return resolved ? ok(c, resolved) : notFound(c);
  });

  routes.put("/:type/:id", async (c) => {
    const tenantId = getTenantId(c);
    const { type, id } = c.req.param();
    const body = await c.req.json<Record<string, unknown>>();
    const updated = await content.updateById(tenantId, type, id, body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
    });
    return ok(c, updated);
  });

  routes.delete("/:type/:id", async (c) => {
    const tenantId = getTenantId(c);
    const { type, id } = c.req.param();
    await content.deleteById(tenantId, type, id);
    return deleted(c);
  });

  routes.put("/:type/:id/publish", async (c) => {
    const tenantId = getTenantId(c);
    const { type, id } = c.req.param();
    const published = await content.publish(tenantId, type, id);
    return ok(c, published);
  });

  return routes;
}

function layoutFiltersFrom(query: Record<string, string | undefined>): LayoutFilters {
  return {
    templateName: query.templateName || undefined,
    segment: query.segment || undefined,
    status: (query.status as LayoutFilters["status"]) || undefined,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function parseFocalPoint(v: unknown): { x: number; y: number } | null {
  if (typeof v !== "string") return null;
  const parts = v.split(",");
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
