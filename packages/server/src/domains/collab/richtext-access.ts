import { type AuthActor, actorHasPermission, PERMISSIONS } from "@noname/auth";
import type { AuthorizationPort } from "../auth/authorization-port";
import { authSubjectFromActor, isStoreAdmin } from "../auth/guards";
import type { DocumentStorage } from "../documents/ports";

const BLOCKED_DOCUMENT_TYPES = new Set([
  "layout",
  "page",
  "asset",
  "content_type",
  "tenant_settings",
]);

/** Same hybrid Keto check as HTTP content write — for rich-text collab ticket + WS join. */
export async function canEditContentDocument(
  authorization: AuthorizationPort,
  storage: DocumentStorage,
  orgId: string,
  contentDocumentId: string,
  actor: AuthActor,
): Promise<boolean> {
  if (!actorHasPermission(actor, PERMISSIONS.CONTENT_DRAFT_WRITE)) {
    return false;
  }

  const doc = await storage.findDocumentById(contentDocumentId);
  if (!doc || doc.orgId !== orgId || BLOCKED_DOCUMENT_TYPES.has(doc.type)) {
    return false;
  }

  if (isStoreAdmin(actor.permissions)) {
    return true;
  }

  const subject = authSubjectFromActor(actor);
  const collectionSlug = doc.collectionId
    ? await storage.findCollectionSlug(orgId, doc.collectionId)
    : null;

  if (collectionSlug) {
    const onCollection = await authorization.check({
      subject,
      permission: "edit",
      namespace: "Collection",
      objectId: collectionSlug,
    });
    if (onCollection) return true;
  }

  return authorization.check({
    subject,
    permission: "edit",
    namespace: "Document",
    objectId: doc.id,
  });
}
