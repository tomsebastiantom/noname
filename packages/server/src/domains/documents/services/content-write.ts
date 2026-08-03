import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import { deepClone } from "../merge";
import type { ContentTypeSchema, DocumentDTO, DocumentStorage } from "../ports";
import { documentIdFromRef } from "../refs";
import { resolveTenantLocales } from "../shared/locale";

export function buildContentData(
  schema: ContentTypeSchema,
  payload: Record<string, unknown>,
  existingData: Record<string, unknown> | undefined,
  locale: string | undefined,
  isCreate: boolean,
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
        errors.push(`field '${field.key}' is not localizable — write without ?locale=`);
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
  const restricted = fields.filter((f) => {
    const readRoles = f.permissions?.read;
    if (!readRoles?.length) return false;
    return !readRoles.includes(role);
  });
  if (restricted.length === 0) return doc;
  const filtered = { ...doc.data };
  for (const f of restricted) {
    delete filtered[f.key];
  }
  return { ...doc, data: filtered };
}

export interface ContentWriteValidator {
  validate(
    schema: ContentTypeSchema,
    data: Record<string, unknown>,
    locales: string[],
  ): { valid: boolean; errors?: string[] };
}

/** Shared create/update pipeline — permissions, locale merge, refs, schema validation. */
export async function prepareContentWrite(
  storage: DocumentStorage,
  validator: ContentWriteValidator,
  orgId: string,
  type: string,
  payload: Record<string, unknown>,
  options: {
    locale?: string;
    role?: string;
    existingData?: Record<string, unknown>;
    isCreate: boolean;
  },
): Promise<{ data: Record<string, unknown> }> {
  const schemaRow = await storage.findContentTypeByName(orgId, type);
  if (!schemaRow) throw new NotFoundError("ContentType", type);

  validateFieldWritePermissions(schemaRow.schema.fields, payload, options.role);

  const { locales } = await resolveTenantLocales(storage, orgId);

  const built = buildContentData(
    schemaRow.schema,
    payload,
    options.existingData,
    options.locale,
    options.isCreate,
  );
  if (built.errors.length) throw new ValidationError(type, built.errors.join("; "));

  await assertDocumentRefs(storage, schemaRow.schema, built.data!, orgId);

  const v = validator.validate(schemaRow.schema, built.data!, locales);
  if (!v.valid) throw new ValidationError(type, v.errors?.join("; ") || "invalid");

  return { data: built.data! };
}
