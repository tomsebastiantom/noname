import { iconUrlFromAsset } from "../assets/icon-url";
import type { AssetDTO, ContentTypeSchema, DocumentDTO, DocumentStorage } from "../ports";

export interface ResolvedDocumentRef {
  documentId: string;
  type: string;
  key: string;
  status: string;
  label: string;
  imageUrl: string | null;
}

const MAX_BATCH = 50;

function pickLocalized(value: unknown, locale: string, defaultLocale: string): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = value as Record<string, unknown>;
    if (locale in map) return map[locale];
    if (defaultLocale in map) return map[defaultLocale];
    return Object.values(map)[0];
  }
  return value;
}

function labelFromContentData(
  schema: ContentTypeSchema | null,
  data: Record<string, unknown>,
  key: string,
  locale: string,
  defaultLocale: string,
): string {
  const titleField =
    schema?.fields.find((f) => f.key === "title") ??
    schema?.fields.find((f) => f.type === "text" || f.type === "longText");
  if (titleField) {
    const raw = data[titleField.key];
    const picked = titleField.isLocalizable ? pickLocalized(raw, locale, defaultLocale) : raw;
    if (picked !== undefined && picked !== null && String(picked).trim() !== "") {
      return String(picked).trim();
    }
  }
  return key;
}

export async function resolveDocumentRefs(
  storage: DocumentStorage,
  orgId: string,
  ids: string[],
  locale: string,
  defaultLocale: string,
  getAsset: (orgId: string, documentId: string) => Promise<AssetDTO | null>,
): Promise<Record<string, ResolvedDocumentRef | null>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_BATCH);
  const out: Record<string, ResolvedDocumentRef | null> = {};

  const schemaCache = new Map<string, ContentTypeSchema | null>();

  for (const documentId of unique) {
    const row = await storage.findDocumentById(documentId);
    if (!row || row.orgId !== orgId) {
      out[documentId] = null;
      continue;
    }

    if (row.type === "asset") {
      const asset = await getAsset(orgId, documentId);
      const data = (asset?.data ?? row.data) as Record<string, unknown>;
      out[documentId] = {
        documentId,
        type: "asset",
        key: row.key,
        status: row.status,
        label: String(data.fileName ?? data.altText ?? row.key),
        imageUrl: iconUrlFromAsset(asset ?? (row as AssetDTO)),
      };
      continue;
    }

    let schema = schemaCache.get(row.type);
    if (schema === undefined) {
      const typeDef = await storage.findContentTypeByName(orgId, row.type);
      schema = typeDef?.schema ?? null;
      schemaCache.set(row.type, schema);
    }

    out[documentId] = {
      documentId,
      type: row.type,
      key: row.key,
      status: row.status,
      label: labelFromContentData(schema, row.data, row.key, locale, defaultLocale),
      imageUrl: null,
    };
  }

  return out;
}

export function parseRefIdsParam(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_BATCH);
}

/** @internal test helper */
export function resolveLabelForRow(
  row: DocumentDTO,
  schema: ContentTypeSchema | null,
  locale: string,
  defaultLocale: string,
): string {
  return labelFromContentData(schema, row.data, row.key, locale, defaultLocale);
}
