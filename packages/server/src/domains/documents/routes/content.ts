import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { auditFromContext, clientOpFromRequest } from "../../../shared/request-audit";
import { created, deleted, notFound, ok } from "../../../shared/respond";
import { denyUnlessCollectionAccess } from "../../auth/deny-unless-document-access";
import { requireActorPermission } from "../../auth/guards";
import { extractCollectionFromBody } from "../shared/document-collection";
import type { DocumentsRouteDeps } from "./deps";
import { denyUnlessDocumentPublish, denyUnlessDocumentWrite } from "./document-write-guard";

async function resolveCollectionSlug(
  storage: DocumentsRouteDeps["storage"],
  orgId: string,
  collectionId: string | null | undefined,
): Promise<string | null> {
  if (!collectionId) return null;
  return storage.findCollectionSlug(orgId, collectionId);
}

export function registerContentRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { content } = deps.service;
  const { storage, authorization } = deps;

  routes.post("/:type", async (c) => {
    const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (actor instanceof Response) return actor;
    const orgId = getOrgId(c);
    const body = await c.req.json<Record<string, unknown>>();
    const { collectionId } = extractCollectionFromBody(body);
    if (collectionId) {
      const slug = await resolveCollectionSlug(storage, orgId, collectionId);
      if (!slug) return notFound(c);
      const denied = await denyUnlessCollectionAccess(c, actor, authorization, slug, "edit");
      if (denied) return denied;
    }
    const createdEntry = await content.create(orgId, c.req.param("type"), body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
      audit: auditFromContext(c, actor),
    });
    return created(c, createdEntry);
  });

  routes.get("/:type", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await content.findByType(orgId, c.req.param("type")));
  });

  routes.get("/:type/search", async (c) => {
    const orgId = getOrgId(c);
    const query = c.req.query("q") ?? "";
    return ok(c, await content.search(orgId, c.req.param("type"), query));
  });

  routes.get("/:type/:id", async (c) => {
    const orgId = getOrgId(c);
    const { type: _type, id } = c.req.param();
    const found = await content.findById(orgId, id, {
      role: c.req.query("role"),
    });
    return found ? ok(c, found) : notFound(c);
  });

  routes.get("/:type/:id/resolve", async (c) => {
    const orgId = getOrgId(c);
    const { type, id } = c.req.param();
    const resolved = await content.resolve(orgId, type, id, c.req.query("locale") || "en-US");
    return resolved ? ok(c, resolved) : notFound(c);
  });

  routes.put("/:type/:id", async (c) => {
    const orgId = getOrgId(c);
    const entryId = c.req.param("id");
    const body = await c.req.json<Record<string, unknown>>();
    const { collectionId } = extractCollectionFromBody(body);
    if (collectionId !== undefined) {
      if (collectionId) {
        const slug = await resolveCollectionSlug(storage, orgId, collectionId);
        if (!slug) return notFound(c);
        const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
        if (actor instanceof Response) return actor;
        const denied = await denyUnlessCollectionAccess(c, actor, authorization, slug, "edit");
        if (denied) return denied;
      }
    }
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.CONTENT_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      entryId,
    );
    if (denied) return denied;
    const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (actor instanceof Response) return actor;
    const { type } = c.req.param();
    const clientOp = clientOpFromRequest(c);
    const updated = await content.updateById(orgId, type, entryId, body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
      audit: auditFromContext(c, actor),
      ...clientOp,
    });
    return ok(c, updated);
  });

  routes.delete("/:type/:id", async (c) => {
    const orgId = getOrgId(c);
    const entryId = c.req.param("id");
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.CONTENT_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      entryId,
    );
    if (denied) return denied;
    const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (actor instanceof Response) return actor;
    const { type, id } = c.req.param();
    await content.deleteById(orgId, type, id, auditFromContext(c, actor));
    return deleted(c);
  });

  routes.put("/:type/:id/publish", async (c) => {
    const orgId = getOrgId(c);
    const entryId = c.req.param("id");
    const denied = await denyUnlessDocumentPublish(
      c,
      PERMISSIONS.CONTENT_PUBLISH,
      authorization,
      storage,
      orgId,
      entryId,
    );
    if (denied) return denied;
    const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_PUBLISH);
    if (actor instanceof Response) return actor;
    const { type, id } = c.req.param();
    const published = await content.publish(orgId, type, id, auditFromContext(c, actor));
    return ok(c, published);
  });
}
