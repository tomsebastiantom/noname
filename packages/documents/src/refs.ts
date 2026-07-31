/** Canonical stored ref — always the documents table row id. */
export interface DocumentRef {
  documentId: string;
}

/** Alias: media fields and config (ogImage, providerIconAssets) use the same ref shape. */
export type MediaRef = DocumentRef;

/** Alias: reference fields; target content type comes from schema `references`. */
export type ContentEntryRef = DocumentRef;

/** Read a document row id from stored ref JSON ({ documentId } or bare uuid string). */
export function documentIdFromRef(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const raw = record.documentId;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return null;
}

export function parseDocumentRef(value: unknown): DocumentRef | null {
  const documentId = documentIdFromRef(value);
  return documentId ? { documentId } : null;
}

/** Parse document id from an admin form field (JSON ref string or bare uuid). */
export function documentIdFromFieldValue(value: string): string | null {
  if (!value.trim()) return null;
  try {
    return documentIdFromRef(JSON.parse(value) as unknown);
  } catch {
    return documentIdFromRef(value);
  }
}
