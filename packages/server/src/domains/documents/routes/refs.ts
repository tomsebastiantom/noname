import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { parseRefIdsParam } from "../refs/resolve";
import type { DocumentsRouteDeps } from "./deps";

export function registerRefRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { resolveRefs, findInboundRefs } = deps.service;

  routes.get("/ref-backrefs", async (c) => {
    const orgId = getOrgId(c);
    const documentId = c.req.query("documentId")?.trim();
    if (!documentId) {
      return c.json({ error: "missing ?documentId= document row id" }, 400);
    }
    const hits = await findInboundRefs(orgId, documentId);
    return ok(c, hits);
  });

  routes.get("/resolve-refs", async (c) => {
    const orgId = getOrgId(c);
    const ids = parseRefIdsParam(c.req.query("ids"));
    if (ids.length === 0) {
      return c.json({ error: "missing ?ids= comma-separated document row ids" }, 400);
    }
    const locale = c.req.query("locale") || undefined;
    const resolved = await resolveRefs(orgId, ids, locale);
    return ok(c, resolved);
  });
}
