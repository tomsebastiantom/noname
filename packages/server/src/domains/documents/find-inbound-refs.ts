import type { DocumentDTO } from "./ports";
import { documentIdFromRef } from "./refs";

export interface InboundRefHit {
  id: string;
  type: string;
  key: string;
  status: string;
  fieldPath: string;
}

function pushHit(
  hits: InboundRefHit[],
  doc: Pick<DocumentDTO, "id" | "type" | "key" | "status">,
  fieldPath: string,
): void {
  if (hits.some((h) => h.id === doc.id && h.fieldPath === fieldPath)) return;
  hits.push({
    id: doc.id,
    type: doc.type,
    key: doc.key,
    status: doc.status,
    fieldPath,
  });
}

/** Walk JSON and collect paths where a ref points at targetDocumentId. */
export function findInboundRefsInDocument(
  doc: DocumentDTO,
  targetDocumentId: string,
): InboundRefHit[] {
  const hits: InboundRefHit[] = [];
  const meta = doc as DocumentDTO & { meta?: Record<string, unknown> };

  scanValue(doc.data, targetDocumentId, "data", doc, hits);
  if (meta.meta && typeof meta.meta === "object") {
    scanValue(meta.meta, targetDocumentId, "meta", doc, hits);
  }

  return hits;
}

function scanValue(
  value: unknown,
  targetDocumentId: string,
  path: string,
  doc: Pick<DocumentDTO, "id" | "type" | "key" | "status">,
  hits: InboundRefHit[],
): void {
  if (value === undefined || value === null) return;

  const refId = documentIdFromRef(value);
  if (refId === targetDocumentId) {
    pushHit(hits, doc, path);
    return;
  }

  if (typeof value === "string" && value.trim() === targetDocumentId) {
    pushHit(hits, doc, path);
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValue(value[i], targetDocumentId, `${path}[${i}]`, doc, hits);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      scanValue(nested, targetDocumentId, path ? `${path}.${key}` : key, doc, hits);
    }
  }
}

export function findInboundRefs(
  documents: DocumentDTO[],
  targetDocumentId: string,
): InboundRefHit[] {
  const hits: InboundRefHit[] = [];
  for (const doc of documents) {
    if (doc.id === targetDocumentId) continue;
    hits.push(...findInboundRefsInDocument(doc, targetDocumentId));
  }
  return hits;
}
