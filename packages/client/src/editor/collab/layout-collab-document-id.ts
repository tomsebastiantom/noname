import {
  type BinaryDocumentId,
  type DocumentId,
  isValidAutomergeUrl,
  isValidDocumentId,
  parseAutomergeUrl,
  stringifyAutomergeUrl,
} from "@automerge/automerge-repo/slim";

const CANONICAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveLayoutCollabDocumentId(layoutDocumentId: string): DocumentId {
  if (isValidAutomergeUrl(layoutDocumentId)) {
    return parseAutomergeUrl(layoutDocumentId).documentId;
  }
  if (isValidDocumentId(layoutDocumentId)) {
    return layoutDocumentId;
  }
  if (!CANONICAL_UUID_RE.test(layoutDocumentId)) {
    throw new Error(`Invalid layout collab document id: ${layoutDocumentId}`);
  }
  const hex = layoutDocumentId.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return parseAutomergeUrl(stringifyAutomergeUrl({ documentId: bytes as BinaryDocumentId }))
    .documentId;
}
