import { coerceScalarString } from "../../../shared/coerce-scalar-string";
import { iconUrlFromAsset } from "../assets/icon-url";
import type { AssetDTO, ContentTypeSchema, DocumentDTO, DocumentStorage } from "../ports";
import { labelFromContentData } from "../shared/locale";

export interface ResolvedDocumentRef {
  documentId: string;
  type: string;
  key: string;
  status: string;
  label: string;
  imageUrl: string | null;
}

const MAX_BATCH = 50;

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
        label: coerceScalarString(data.fileName) || coerceScalarString(data.altText) || row.key,
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
