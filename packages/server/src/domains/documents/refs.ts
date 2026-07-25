/** Canonical stored ref — always the documents table row id. */
export interface DocumentRef {
  documentId: string;
}

/** Alias: media fields and config (ogImage, providerIconAssets) use the same ref shape. */
export type MediaRef = DocumentRef;

/** Alias: reference fields use the same ref shape; target content type comes from schema `references`. */
export type ContentEntryRef = DocumentRef;

/** Read a document row id from stored ref JSON (accepts legacy assetId / entryId keys). */
export function documentIdFromRef(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["documentId", "assetId", "entryId"] as const) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  return null;
}

export function parseDocumentRef(value: unknown): DocumentRef | null {
  const documentId = documentIdFromRef(value);
  return documentId ? { documentId } : null;
}

/** @deprecated Use parseDocumentRef */
export const parseMediaRef = parseDocumentRef;

/** @deprecated Use parseDocumentRef */
export const parseContentEntryRef = parseDocumentRef;

/** @deprecated Use documentIdFromRef */
export const assetIdFromRef = documentIdFromRef;

/** @deprecated Use documentIdFromRef */
export const entryIdFromRef = documentIdFromRef;

/** Normalize ref values to canonical { documentId } for persistence. */
export function normalizeDocumentRef(value: unknown): DocumentRef | null {
  return parseDocumentRef(value);
}
