import type { AuthActor, PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import type { AuthorizationPort, ResourcePermission } from "./authorization-port";
import { authSubjectFromActor, isStoreAdmin, requireActorPermission } from "./guards";

/** Hybrid doc access: Postgres folder → Keto Collection check; fallback Document direct/share. */
export async function denyUnlessDocumentAccess(
  c: Context,
  platformPermission: PermissionKey,
  authorization: AuthorizationPort,
  doc: { id: string; collectionSlug: string | null },
  action: ResourcePermission,
): Promise<Response | null> {
  const actor = await requireActorPermission(c, platformPermission);
  if (actor instanceof Response) return actor;

  if (action === "publish" && actor.type === "agent") {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (isStoreAdmin(actor.permissions)) {
    return null;
  }

  const subject = authSubjectFromActor(actor);

  if (doc.collectionSlug) {
    const allowed = await authorization.check({
      subject,
      permission: action,
      namespace: "Collection",
      objectId: doc.collectionSlug,
    });
    if (allowed) return null;
  }

  const onDocument = await authorization.check({
    subject,
    permission: action,
    namespace: "Document",
    objectId: doc.id,
  });
  if (onDocument) return null;

  return c.json({ error: "Forbidden" }, 403);
}

/** When creating docs in a folder, actor must have Keto access on that folder (unless admin). */
export async function denyUnlessCollectionAccess(
  c: Context,
  actor: AuthActor,
  authorization: AuthorizationPort,
  collectionSlug: string | null | undefined,
  action: ResourcePermission,
): Promise<Response | null> {
  if (!collectionSlug) return null;
  if (isStoreAdmin(actor.permissions)) return null;

  const allowed = await authorization.check({
    subject: authSubjectFromActor(actor),
    permission: action,
    namespace: "Collection",
    objectId: collectionSlug,
  });
  if (!allowed) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}
