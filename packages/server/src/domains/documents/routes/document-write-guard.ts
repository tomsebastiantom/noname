import type { PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import type { AuthorizationPort } from "../../auth/authorization-port";
import { denyUnless } from "../../auth/deny-unless";
import { denyUnlessDocumentAccess } from "../../auth/deny-unless-document-access";
import type { DocumentStorage } from "../ports";

/** Platform permission + hybrid Keto when document id is known. */
export async function denyUnlessDocumentWrite(
  c: Context,
  platformPermission: PermissionKey,
  authorization: AuthorizationPort,
  storage: DocumentStorage,
  orgId: string,
  documentId: string | null | undefined,
): Promise<Response | null> {
  if (!documentId) {
    return denyUnless(c, platformPermission);
  }
  const doc = await storage.findDocumentById(documentId);
  if (!doc || doc.orgId !== orgId) {
    return c.json({ error: "Not found" }, 404);
  }
  const collectionSlug = doc.collectionId
    ? await storage.findCollectionSlug(orgId, doc.collectionId)
    : null;
  return denyUnlessDocumentAccess(
    c,
    platformPermission,
    authorization,
    {
      id: doc.id,
      collectionSlug,
    },
    "edit",
  );
}

export async function denyUnlessDocumentPublish(
  c: Context,
  platformPermission: PermissionKey,
  authorization: AuthorizationPort,
  storage: DocumentStorage,
  orgId: string,
  documentId: string,
): Promise<Response | null> {
  const doc = await storage.findDocumentById(documentId);
  if (!doc || doc.orgId !== orgId) {
    return c.json({ error: "Not found" }, 404);
  }
  const collectionSlug = doc.collectionId
    ? await storage.findCollectionSlug(orgId, doc.collectionId)
    : null;
  return denyUnlessDocumentAccess(
    c,
    platformPermission,
    authorization,
    {
      id: doc.id,
      collectionSlug,
    },
    "publish",
  );
}
