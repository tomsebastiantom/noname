import { ValidationError } from "../../../shared/domain-error";
import { LayoutDocument } from "../entity";
import { deepClone } from "../merge";
import type {
  AssetDTO,
  ContentTypeSchema,
  DocumentDTO,
  DocumentStorage,
  LayoutDTO,
  TenantSettingsDTO,
} from "../ports";
import { documentIdFromRef } from "../refs";
import { DEFAULT_DEFAULT_LOCALE, DEFAULT_LOCALES } from "./constants";

export function buildContentData(
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
      if (locale && !isCreate) {
        errors.push(`field '${field.key}' is not localizable — write without ?locale`);
        continue;
      }
      data[field.key] = raw;
    }
  }

  for (const field of schema.fields) {
    if (field.required && data[field.key] === undefined) {
      errors.push(`field '${field.key}' is required`);
    }
  }

  void defaultLocale;
  return { data, errors };
}

export async function assertDocumentRefs(
  storage: DocumentStorage,
  schema: ContentTypeSchema,
  data: Record<string, unknown>,
  orgId: string,
): Promise<void> {
  for (const field of schema.fields) {
    if (field.type === "media") {
      await checkDocumentRef(storage, orgId, field.key, data[field.key], "asset");
      continue;
    }
    if (field.type === "mediaList") {
      const value = data[field.key];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        await checkDocumentRef(storage, orgId, field.key, item, "asset");
      }
      continue;
    }
    if (field.type === "reference") {
      const targetType = field.references?.trim();
      if (!targetType) {
        throw new ValidationError(
          field.key,
          `reference field '${field.key}' must declare references (target content type)`,
        );
      }
      await checkDocumentRef(storage, orgId, field.key, data[field.key], targetType);
    }
  }
}

async function checkDocumentRef(
  storage: DocumentStorage,
  orgId: string,
  fieldKey: string,
  value: unknown,
  expectedType: string,
): Promise<void> {
  if (value === undefined) return;
  const documentId = documentIdFromRef(value);
  if (!documentId) return;

  const found = await storage.findDocumentById(documentId);
  if (!found || found.orgId !== orgId) {
    throw new ValidationError(fieldKey, `referenced document '${documentId}' does not exist`);
  }
  if (found.type !== expectedType) {
    throw new ValidationError(
      fieldKey,
      `referenced document '${documentId}' is type '${found.type}', expected '${expectedType}'`,
    );
  }
}

export function validateContentTypeName(name: string): void {
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    throw new ValidationError(
      "name",
      "content type name must be lowercase alphanumeric/underscore",
    );
  }
}

export function validateSchema(schema: ContentTypeSchema): void {
  if (!schema || !Array.isArray(schema.fields)) {
    throw new ValidationError("schema", "schema must have a 'fields' array");
  }
  for (const f of schema.fields) {
    if (!f.key || !f.type) {
      throw new ValidationError("schema", "each field needs a key and a type");
    }
    if (f.type === "reference" && !f.references?.trim()) {
      throw new ValidationError(
        "schema",
        `reference field '${f.key}' must declare references (target content type)`,
      );
    }
  }
}

export function validateTemplateName(name: string): void {
  if (!name || !/^[a-z0-9_-]+$/.test(name)) {
    throw new ValidationError(
      "templateName",
      "templateName must be lowercase, alphanumeric, dash, or underscore",
    );
  }
}

export function validateSpec(spec: Record<string, unknown>): void {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ValidationError("spec", "spec must be an object");
  }
}

export function readContentRef(data: Record<string, unknown>): string | null {
  const ref = data.contentRef;
  return typeof ref === "string" && ref.trim() !== "" ? ref : null;
}

export function validateAssetMime(mimeType: string): void {
  if (!/^(image|video|application)\//.test(mimeType)) {
    throw new ValidationError("mimeType", `unsupported asset mime type '${mimeType}'`);
  }
}

export function resolveAssetUrl(storageKey: string, _mimeType: string): string {
  const base = process.env.ASSET_PUBLIC_BASE_URL || "https://assets.noname.dev";
  return `${base}/${storageKey}`;
}

function buildEnrichedOriginal(
  original: { url?: string; width?: number | null; height?: number | null } | undefined,
  originalUrl: string | undefined,
): { url?: string; width?: number | null; height?: number | null } | undefined {
  if (original) {
    return { ...original, url: originalUrl ?? original.url };
  }
  if (originalUrl) {
    return { url: originalUrl, width: null, height: null };
  }
  return undefined;
}

export function enrichAssetUrls(dto: AssetDTO): AssetDTO {
  const storageKey = typeof dto.data.storageKey === "string" ? dto.data.storageKey : null;
  const mimeType = typeof dto.data.mimeType === "string" ? dto.data.mimeType : "";
  const original = dto.data.original as
    | { url?: string; width?: number | null; height?: number | null }
    | undefined;
  const originalUrl = storageKey ? resolveAssetUrl(storageKey, mimeType) : original?.url;

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
    data: {
      ...dto.data,
      original: buildEnrichedOriginal(original, originalUrl),
      _resolved: resolved,
    },
  };
}

export function validateFieldWritePermissions(
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

export function filterReadFields(
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

export function defaultTenantSettings(): Omit<TenantSettingsDTO, "id" | "orgId"> {
  return {
    slug: null,
    locales: [...DEFAULT_LOCALES],
    defaultLocale: DEFAULT_DEFAULT_LOCALE,
    seo: {},
    integrations: {},
    auth: {
      providers: [],
      idpIds: {},
      allowPassword: true,
    },
  };
}

export function toLayoutEntity(dto: LayoutDTO): LayoutDocument {
  return new LayoutDocument(
    dto.id,
    dto.orgId,
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
