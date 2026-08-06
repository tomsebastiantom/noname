import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { notFound, ok } from "../../../shared/respond";
import { requireActorPermission } from "../../auth/guards";
import { draftWritePermissionForDocumentType } from "../shared/document-draft-permission";
import type { DocumentsRouteDeps } from "./deps";
import { denyUnlessDocumentWrite } from "./document-write-guard";

const DEFAULT_OPS_LIMIT = 50;
const MAX_OPS_LIMIT = 200;

function parseFromVersion(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function parseLimit(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_OPS_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_OPS_LIMIT;
  return Math.min(value, MAX_OPS_LIMIT);
}

export function registerDocumentOpsRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { storage, authorization } = deps;

  routes.get("/document/:id/ops", async (c) => {
    const orgId = getOrgId(c);
    const documentId = c.req.param("id");
    const doc = await storage.findDocumentById(documentId);
    if (!doc || doc.orgId !== orgId) {
      return notFound(c);
    }

    const permission = draftWritePermissionForDocumentType(doc.type);
    const denied = await denyUnlessDocumentWrite(
      c,
      permission,
      authorization,
      storage,
      orgId,
      documentId,
    );
    if (denied) return denied;

    const actor = await requireActorPermission(c, permission);
    if (actor instanceof Response) return actor;

    const ops = await storage.listDocumentOps({
      orgId,
      documentId,
      fromVersion: parseFromVersion(c.req.query("from_version")),
      limit: parseLimit(c.req.query("limit")),
    });

    return ok(c, { documentId, ops });
  });
}
