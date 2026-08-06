import { type AuthActor, actorHasPermission, PERMISSIONS } from "@noname/auth";
import type { AuthorizationPort } from "../auth/authorization-port";
import { authSubjectFromActor, isStoreAdmin } from "../auth/guards";
import type { DocumentStorage } from "../documents/ports";

/** Same hybrid Keto check as HTTP layout write — for collab ticket + WS join. */
export async function canEditLayoutDocument(
  authorization: AuthorizationPort,
  storage: DocumentStorage,
  orgId: string,
  layoutDocumentId: string,
  actor: AuthActor,
): Promise<boolean> {
  if (!actorHasPermission(actor, PERMISSIONS.LAYOUT_DRAFT_WRITE)) {
    return false;
  }

  const doc = await storage.findDocumentById(layoutDocumentId);
  if (!doc || doc.orgId !== orgId || doc.type !== "layout") {
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
