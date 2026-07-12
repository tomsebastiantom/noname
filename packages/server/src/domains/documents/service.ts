import type {
  AssetDTO,
  AssetDocumentService,
  ContentDocumentService,
  ContentTypeDocumentService,
  ContentTypeSchema,
  DocumentDTO,
  DocumentService,
  DocumentStorage,
  LayoutDTO,
  LayoutDocumentService,
  PageTreeService,
  TenantSettingsDTO,
  TenantSettingsService,
  UploadAssetInput,
} from "./ports";
import { ContentDocument, LayoutDocument } from "./entity";
import { flushEvents } from "../../shared/aggregate-root";
import { eventBus } from "../../shared/event-bus";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { applyOverrides, deepClone } from "./merge";

import { contentValidator } from "./validator";
import { LayoutEvents } from "./events";

const DEFAULT_LOCALES = ["en-US"];
const DEFAULT_DEFAULT_LOCALE = "en-US";

export function createDocumentsService(
  storage: DocumentStorage,
  validator: typeof contentValidator = contentValidator,
): DocumentService {
  // -------------------------------------------------------------------------
  // Content type schema registry.
  // -------------------------------------------------------------------------
  const contentTypes: ContentTypeDocumentService = {
    async create(tenantId, name, schema) {
      validateContentTypeName(name);
      validateSchema(schema);
      const existing = await storage.findContentTypeByName(tenantId, name);
      if (existing) throw new ValidationError("name", `Content type '${name}' already exists`);
      const created = await storage.createContentType(tenantId, name, schema);
      return created;
    },
    list: (tenantId) => storage.findContentTypes(tenantId),
    get: (tenantId, name) => storage.findContentTypeByName(tenantId, name),
    async update(tenantId, name, schema) {
      validateSchema(schema);
      const existing = await storage.findContentTypeByName(tenantId, name);
      if (!existing) throw new NotFoundError("ContentType", name);
      return storage.updateContentType(tenantId, name, schema);
    },
  };

  // -------------------------------------------------------------------------
  // Tenant settings — locales, SEO defaults, integrations.
  // -------------------------------------------------------------------------
  const tenantSettings: TenantSettingsService = {
    async get(tenantId) {
      const existing = await storage.getTenantSettings(tenantId);
      if (existing) return existing;
      return storage.upsertTenantSettings(tenantId, defaultTenantSettings());
    },
    upsert: (tenantId, data) => storage.upsertTenantSettings(tenantId, data),
  };

  // -------------------------------------------------------------------------
  // Content — schema-validated, locale-aware entries.
  // -------------------------------------------------------------------------
  const content: ContentDocumentService = {
    async create(tenantId, type, data, opts) {
      const locale = opts?.locale;
      const role = opts?.role;
      const schema = await storage.findContentTypeByName(tenantId, type);
      if (!schema) throw new NotFoundError("ContentType", type);

      validateFieldWritePermissions(schema.schema.fields, data, role);

      const ts = await storage.getTenantSettings(tenantId);
      const locales = ts?.locales ?? DEFAULT_LOCALES;
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const built = buildContentData(schema.schema, data, undefined, locale, true, defaultLocale);
      if (built.errors.length) throw new ValidationError(type, built.errors.join("; "));

      await assertAssetRefs(storage, schema.schema, built.data!, tenantId);

      const v = validator.validate(schema.schema, built.data!, locales);
      if (!v.valid) throw new ValidationError(type, v.errors?.join("; ") || "invalid");

      const entity = ContentDocument.create(tenantId, type, built.data!);
      const saved = await storage.createDocument({
        tenantId,
        type,
        key: entity.id,
        data: entity.data,
        status: "draft",
      });
      flushEvents(entity);
      return saved;
    },

    findByType: async (tenantId, type) => {
      const rows = await storage.listDocuments(tenantId, { type });
      return rows;
    },

    findById: async (_tenantId, id, opts) => {
      const found = await storage.findDocumentById(id);
      if (!found) return null;
      const schema = await storage.findContentTypeByName(_tenantId, found.type);
      if (!schema) return found;
      return filterReadFields(found, schema.schema.fields, opts?.role);
    },

    async updateById(tenantId, type, id, data, opts) {
      const locale = opts?.locale;
      const role = opts?.role;
      const schema = await storage.findContentTypeByName(tenantId, type);
      if (!schema) throw new NotFoundError("ContentType", type);
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);

      validateFieldWritePermissions(schema.schema.fields, data, role);

      const ts = await storage.getTenantSettings(tenantId);
      const locales = ts?.locales ?? DEFAULT_LOCALES;
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const built = buildContentData(
        schema.schema,
        data,
        existing.data,
        locale,
        false,
        defaultLocale,
      );
      if (built.errors.length) throw new ValidationError(type, built.errors.join("; "));

      await assertAssetRefs(storage, schema.schema, built.data!, tenantId);

      const v = validator.validate(schema.schema, built.data!, locales);
      if (!v.valid) throw new ValidationError(type, v.errors?.join("; ") || "invalid");

      const updated = await storage.updateDocument(existing.id, built.data!);
      const entity = new ContentDocument(existing.id, tenantId, type, updated.data, "draft");
      entity.update(updated.data);
      flushEvents(entity);
      return updated;
    },

    async deleteById(tenantId, type, id) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);
      const entity = new ContentDocument(
        existing.id,
        tenantId,
        type,
        existing.data,
        existing.status,
      );
      entity.deleteEntry();
      await storage.deleteDocument(existing.id);
      flushEvents(entity);
    },

    async publish(tenantId, type, id) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);
      const published = await storage.publishDocument(existing.id);
      const entity = new ContentDocument(existing.id, tenantId, type, existing.data, "draft");
      entity.publish();
      flushEvents(entity);
      return published;
    },

    async resolve(tenantId, type, id, locale) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type) return null;
      const schema = await storage.findContentTypeByName(tenantId, type);
      const ts = await storage.getTenantSettings(tenantId);
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const resolved: Record<string, unknown> = {};
      if (!schema) return existing.data;

      for (const field of schema.schema.fields) {
        const value = existing.data[field.key];
        if (value === undefined) continue;
        if (field.isLocalizable && value && typeof value === "object" && !Array.isArray(value)) {
          const map = value as Record<string, unknown>;
          const picked =
            locale in map
              ? map[locale]
              : defaultLocale in map
                ? map[defaultLocale]
                : Object.values(map)[0];
          resolved[field.key] = picked;
        } else {
          resolved[field.key] = value;
        }
      }
      return resolved;
    },
  };

  // -------------------------------------------------------------------------
  // Layout — json-render templates with per-segment override variants.
  // -------------------------------------------------------------------------
  const layout: LayoutDocumentService = {
    async create(tenantId, input) {
      validateTemplateName(input.templateName);
      validateSpec(input.spec);

      const entity = LayoutDocument.create(
        tenantId,
        input.templateName,
        input.segment || "default",
        input.spec,
        1,
        null,
      );
      const saved = await storage.createDocument({
        tenantId,
        type: "layout",
        key: entity.templateName,
        segment: entity.segment,
        data: { spec: entity.spec },
        baseVersion: null,
        status: "draft",
      });
      flushEvents(entity);
      return saved as unknown as LayoutDTO;
    },

    async addVariant(tenantId, templateName, segment, overrides) {
      validateTemplateName(templateName);
      if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        throw new ValidationError("overrides", "overrides must be an object of dot-path keys");
      }

      const publishedDefault = await storage.findDocument(
        tenantId,
        "layout",
        templateName,
        "default",
      );
      if (publishedDefault?.status !== "published") {
        throw new NotFoundError("LayoutDocument", `${templateName} (published default)`);
      }
      const baseVersion = publishedDefault.version;

      const saved = await storage.createDocument({
        tenantId,
        type: "layout",
        key: templateName,
        segment,
        data: { overrides, baseVersion },
        baseVersion,
        status: "draft",
      });
      void eventBus.publish(LayoutEvents.VARIANT_CREATED, saved as unknown as LayoutDTO);
      return saved as unknown as LayoutDTO;
    },

    async publish(_tenantId, id) {
      const existing = await storage.findDocumentById(id);
      if (existing?.type !== "layout") throw new NotFoundError("LayoutDocument", id);
      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.publish();
      const updated = await storage.publishDocument(id);
      flushEvents(entity);
      return updated as unknown as LayoutDTO;
    },

    async archive(_tenantId, id) {
      const existing = await storage.findDocumentById(id);
      if (existing?.type !== "layout") throw new NotFoundError("LayoutDocument", id);
      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.archive();
      const updated = await storage.archiveDocument(id);
      flushEvents(entity);
      return updated as unknown as LayoutDTO;
    },

    list: (tenantId, filters) =>
      storage.listDocuments(tenantId, {
        type: "layout",
        segment: filters?.segment,
        status: filters?.status,
      }) as unknown as Promise<LayoutDTO[]>,

    get: async (_tenantId, id) => {
      const found = await storage.findDocumentById(id);
      return found && found.type === "layout" ? (found as LayoutDTO) : null;
    },

    async resolve(tenantId, templateName, segment) {
      const publishedDefault = await storage.findDocument(
        tenantId,
        "layout",
        templateName,
        "default",
      );
      if (publishedDefault?.status !== "published") return null;
      const defaultSpec = (publishedDefault.data.spec as Record<string, unknown>) ?? {};

      if (segment === "default") {
        return {
          templateName,
          segment: "default",
          version: publishedDefault.version,
          spec: deepClone(defaultSpec),
          conflicts: [],
        };
      }

      const variant = await storage.findDocument(tenantId, "layout", templateName, segment);
      if (variant?.status !== "published") {
        // Fall back to the default spec when no published variant exists.
        return {
          templateName,
          segment: "default",
          version: publishedDefault.version,
          spec: deepClone(defaultSpec),
          conflicts: [],
        };
      }

      const overrides = (variant.data.overrides as Record<string, unknown>) ?? {};
      const { spec, conflicts } = applyOverrides(defaultSpec, overrides);
      return {
        templateName,
        segment,
        version: publishedDefault.version,
        spec,
        conflicts,
      };
    },
  };

  // -------------------------------------------------------------------------
  // Assets — media metadata (binary lives in R2 / pluggable storage).
  // -------------------------------------------------------------------------
  const assets: AssetDocumentService = {
    async create(tenantId, input: UploadAssetInput) {
      validateAssetMime(input.mimeType);
      const assetId = crypto.randomUUID();
      const data: Record<string, unknown> = {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        storageKey: input.storageKey,
        hash: input.hash,
        original: {
          url: resolveAssetUrl(input.storageKey, input.mimeType),
          width: input.width ?? null,
          height: input.height ?? null,
        },
        variants: input.variants ?? {},
        altText: input.altText ?? null,
        caption: input.caption ?? null,
        focalPoint: input.focalPoint ?? null,
        uploadedAt: new Date().toISOString(),
      };
      const saved = await storage.createDocument({
        tenantId,
        type: "asset",
        key: assetId,
        data,
        status: "draft",
      });
      return saved as unknown as AssetDTO;
    },

    async findByHash(tenantId, hash) {
      const found = await storage.findAssetByHash(tenantId, hash);
      return found ? (found as unknown as AssetDTO) : null;
    },

    get: async (tenantId, assetId) => {
      const found = await storage.findDocument(tenantId, "asset", assetId);
      if (!found) return null;
      return enrichAssetUrls(found as unknown as AssetDTO);
    },

    list: async (tenantId) => {
      const rows = await storage.listDocuments(tenantId, { type: "asset" });
      return rows.map((r) => enrichAssetUrls(r as unknown as AssetDTO)) as AssetDTO[];
    },

    async update(tenantId, assetId, input) {
      const existing = await storage.findDocument(tenantId, "asset", assetId);
      if (!existing) throw new NotFoundError("Asset", assetId);
      const data = { ...existing.data };
      if (input.altText !== undefined) data.altText = input.altText;
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.focalPoint !== undefined) data.focalPoint = input.focalPoint;
      if (input.variants !== undefined) data.variants = input.variants;
      const updated = await storage.updateDocument(existing.id, data);
      return enrichAssetUrls(updated as unknown as AssetDTO);
    },

    async archive(tenantId, assetId) {
      const existing = await storage.findDocument(tenantId, "asset", assetId);
      if (!existing) throw new NotFoundError("Asset", assetId);
      return (await storage.archiveDocument(existing.id)) as unknown as AssetDTO;
    },

    async delete(tenantId, assetId) {
      const existing = await storage.findDocument(tenantId, "asset", assetId);
      if (!existing) throw new NotFoundError("Asset", assetId);
      await storage.deleteDocument(existing.id);
    },

    async publish(tenantId, assetId) {
      const existing = await storage.findDocument(tenantId, "asset", assetId);
      if (!existing) throw new NotFoundError("Asset", assetId);
      return (await storage.publishDocument(existing.id)) as unknown as AssetDTO;
    },
  };

  // -------------------------------------------------------------------------
  // Page tree — URL routing layer (locale-aware slug -> page identity).
  // -------------------------------------------------------------------------
  const pages: PageTreeService = {
    async resolveByUrl(tenantId, url, locale) {
      const tree = await storage.findDocument(tenantId, "page_tree", "main");
      if (!tree) return null;
      const pages =
        (tree.data.pages as
          | Array<{ id: string; slug: Record<string, string>; pageId: string }>
          | undefined) ?? [];

      const ts = await storage.getTenantSettings(tenantId);
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const match = pages.find((p) => {
        const slugMap = p.slug ?? {};
        return (
          slugMap[locale] === url ||
          slugMap[defaultLocale] === url ||
          Object.values(slugMap)[0] === url
        );
      });
      if (!match) return null;

      const page = await storage.findDocument(tenantId, "page", match.pageId);
      if (!page) return null;
      const data = page.data;
      return {
        pageId: match.pageId,
        layoutRef: (data.layoutRef as string) ?? "",
        contentRef: (data.contentRef as string) ?? "",
        locale,
      };
    },
  };

  return { contentTypes, tenantSettings, content, layout, assets, pages };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function buildContentData(
  schema: ContentTypeSchema,
  payload: Record<string, unknown>,
  existingData: Record<string, unknown> | undefined,
  locale: string | undefined,
  isCreate: boolean,
  defaultLocale: string,
): { data?: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const data: Record<string, unknown> = existingData ? deepClone(existingData) : {};

  for (const field of schema.fields) {
    const raw = payload[field.key];
    if (raw === undefined) {
      if (isCreate && field.required) {
        errors.push(`field '${field.key}' is required`);
      }
      continue;
    }

    if (field.isLocalizable) {
      if (!locale) {
        errors.push(`field '${field.key}' is localizable — write with ?locale=`);
        continue;
      }
      const map =
        data[field.key] && typeof data[field.key] === "object" && !Array.isArray(data[field.key])
          ? { ...(data[field.key] as Record<string, unknown>) }
          : {};
      map[locale] = raw;
      data[field.key] = map;
    } else {
      if (locale) {
        errors.push(`field '${field.key}' is not localizable — write without ?locale`);
        continue;
      }
      data[field.key] = raw;
    }
  }

  // Required fields must stay populated after an update too.
  for (const field of schema.fields) {
    if (field.required && data[field.key] === undefined) {
      errors.push(`field '${field.key}' is required`);
    }
  }

  void defaultLocale;
  return { data, errors };
}

async function assertAssetRefs(
  storage: DocumentStorage,
  schema: ContentTypeSchema,
  data: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  for (const field of schema.fields) {
    if (field.type !== "media" && field.type !== "mediaList") continue;
    const value = data[field.key];
    if (value === undefined) continue;
    const check = async (assetId: string) => {
      if (!assetId) return;
      const found = await storage.findDocument(tenantId, "asset", assetId);
      if (!found) throw new ValidationError(field.key, `asset '${assetId}' does not exist`);
    };
    if (field.type === "media") {
      await check((value as { assetId?: string })?.assetId ?? "");
    } else if (Array.isArray(value)) {
      for (const item of value) {
        await check((item as { assetId?: string })?.assetId ?? "");
      }
    }
  }
}

function validateContentTypeName(name: string): void {
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    throw new ValidationError(
      "name",
      "content type name must be lowercase alphanumeric/underscore",
    );
  }
}

function validateSchema(schema: ContentTypeSchema): void {
  if (!schema || !Array.isArray(schema.fields)) {
    throw new ValidationError("schema", "schema must have a 'fields' array");
  }
  for (const f of schema.fields) {
    if (!f.key || !f.type) {
      throw new ValidationError("schema", "each field needs a key and a type");
    }
  }
}

function validateTemplateName(name: string): void {
  if (!name || !/^[a-z0-9_-]+$/.test(name)) {
    throw new ValidationError(
      "templateName",
      "templateName must be lowercase, alphanumeric, dash, or underscore",
    );
  }
}

function validateSpec(spec: Record<string, unknown>): void {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ValidationError("spec", "spec must be an object");
  }
}

function validateAssetMime(mimeType: string): void {
  if (!/^(image|video|application)\//.test(mimeType)) {
    throw new ValidationError("mimeType", `unsupported asset mime type '${mimeType}'`);
  }
}

function resolveAssetUrl(storageKey: string, _mimeType: string): string {
  const base = process.env.ASSET_PUBLIC_BASE_URL || "https://assets.noname.dev";
  return `${base}/${storageKey}`;
}

function enrichAssetUrls(dto: AssetDTO): AssetDTO {
  const variants =
    (dto.data.variants as Record<
      string,
      { url: string; width: number | null; height: number | null; format?: string }
    >) ?? {};
  const resolved: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(variants)) {
    resolved[name] = {
      url: v.url,
      width: v.width ?? null,
      height: v.height ?? null,
      format: v.format ?? null,
    };
  }
  return {
    ...dto,
    data: { ...dto.data, _resolved: resolved },
  };
}

function validateFieldWritePermissions(
  fields: { key: string; permissions?: { read?: string[]; write?: string[] } }[],
  payload: Record<string, unknown>,
  role?: string,
): void {
  if (!role) return;
  for (const field of fields) {
    if (!(field.key in payload)) continue;
    const writeRoles = field.permissions?.write;
    if (writeRoles && writeRoles.length > 0 && !writeRoles.includes(role)) {
      throw new ValidationError(field.key, `role '${role}' cannot write field '${field.key}'`);
    }
  }
}

function filterReadFields(
  doc: DocumentDTO,
  fields: { key: string; permissions?: { read?: string[] } }[],
  role?: string,
): DocumentDTO {
  if (!role) return doc;
  const restricted = fields.filter(
    (f) =>
      f.permissions?.read && f.permissions.read.length > 0 && !f.permissions.read.includes(role),
  );
  if (restricted.length === 0) return doc;
  const filtered = { ...doc.data };
  for (const f of restricted) {
    delete filtered[f.key];
  }
  return { ...doc, data: filtered };
}

function defaultTenantSettings(): Omit<TenantSettingsDTO, "id" | "tenantId"> {
  return {
    locales: [...DEFAULT_LOCALES],
    defaultLocale: DEFAULT_DEFAULT_LOCALE,
    seo: {},
    integrations: {},
  };
}

function toLayoutEntity(dto: LayoutDTO): LayoutDocument {
  return new LayoutDocument(
    dto.id,
    dto.tenantId,
    dto.key,
    dto.version,
    dto.segment,
    (dto.data.spec as Record<string, unknown>) ?? {},
    dto.status,
    dto.baseVersion,
    dto.createdAt,
    dto.updatedAt,
  );
}
