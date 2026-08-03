import { hasPermission, PERMISSIONS, type PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import type { AuthorizationPort, ResourcePermission } from "./authorization-port";
import { requirePermission } from "./guards";

/** Hybrid doc access: Postgres tags → Keto Tag check; fallback Document direct/share. */
export async function denyUnlessDocumentAccess(
  c: Context,
  platformPermission: PermissionKey,
  authorization: AuthorizationPort,
  doc: { id: string; tags: string[] },
  action: ResourcePermission,
): Promise<Response | null> {
  const auth = await requirePermission(c, platformPermission);
  if (auth instanceof Response) return auth;

  // Store admin bypass — no store-wide Keto tuples required.
  if (hasPermission(auth.permissions, PERMISSIONS.AUTH_MANAGE)) {
    return null;
  }

  const subject = { type: "User" as const, id: auth.userId };

  for (const tag of doc.tags) {
    const allowed = await authorization.check({
      subject,
      permission: action,
      namespace: "Tag",
      objectId: tag,
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

/** When creating docs with tags, user must have Keto access on every tag (unless admin). */
export async function denyUnlessTagsAccess(
  c: Context,
  auth: { userId: string; permissions: PermissionKey[] },
  authorization: AuthorizationPort,
  tags: string[],
  action: ResourcePermission,
): Promise<Response | null> {
  if (tags.length === 0) return null;
  if (hasPermission(auth.permissions, PERMISSIONS.AUTH_MANAGE)) return null;

  const subject = { type: "User" as const, id: auth.userId };
  for (const tag of tags) {
    const allowed = await authorization.check({
      subject,
      permission: action,
      namespace: "Tag",
      objectId: tag,
    });
    if (!allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }
  return null;
}
