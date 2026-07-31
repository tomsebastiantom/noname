import { NotFoundError } from "../../../shared/domain-error";
import type { DocumentDTO, DocumentStorage } from "../ports";
import { isPublished } from "../shared/document-status";

export async function requireAssetDocument(
  storage: DocumentStorage,
  orgId: string,
  documentId: string,
): Promise<DocumentDTO> {
  const existing = await storage.findDocumentById(documentId);
  if (!existing || existing.orgId !== orgId || existing.type !== "asset") {
    throw new NotFoundError("Asset", documentId);
  }
  return existing;
}

export async function requireLayoutDocument(
  storage: DocumentStorage,
  documentId: string,
  orgId?: string,
): Promise<DocumentDTO> {
  const existing = await storage.findDocumentById(documentId);
  if (existing?.type !== "layout") {
    throw new NotFoundError("LayoutDocument", documentId);
  }
  if (orgId !== undefined && existing.orgId !== orgId) {
    throw new NotFoundError("LayoutDocument", documentId);
  }
  return existing;
}

export async function requirePublishedLayout(
  storage: DocumentStorage,
  orgId: string,
  templateName: string,
  segment = "default",
): Promise<DocumentDTO> {
  const row = await storage.findDocument(orgId, "layout", templateName, segment);
  if (!row || !isPublished(row)) {
    throw new NotFoundError("LayoutDocument", `${templateName} (published ${segment})`);
  }
  return row;
}

export async function requireContentEntry(
  storage: DocumentStorage,
  orgId: string,
  type: string,
  documentId: string,
): Promise<DocumentDTO> {
  const existing = await storage.findDocumentById(documentId);
  if (!existing || existing.orgId !== orgId || existing.type !== type) {
    throw new NotFoundError("ContentEntry", `${type}/${documentId}`);
  }
  return existing;
}
