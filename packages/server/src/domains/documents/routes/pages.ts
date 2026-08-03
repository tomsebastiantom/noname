import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { notFound, ok } from "../../../shared/respond";
import type { PageTreePageRef } from "../ports";
import type { DocumentsRouteDeps } from "./deps";
import { denyUnlessDocumentWrite } from "./document-write-guard";

export function registerPageRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { pages } = deps.service;
  const { storage, authorization } = deps;

  routes.get("/page_tree/main", async (c) => {
    const orgId = getOrgId(c);
    const tree = await pages.getMainTree(orgId);
    return tree ? ok(c, tree) : notFound(c);
  });

  routes.get("/page_tree/resolve", async (c) => {
    const orgId = getOrgId(c);
    const url = c.req.query("url");
    const locale = c.req.query("locale") || "en-US";
    if (!url) return c.json({ error: "missing ?url=" }, 400);
    const route = await pages.resolveByUrl(orgId, url, locale);
    return route ? ok(c, route) : notFound(c);
  });

  routes.put("/page_tree/main", async (c) => {
    const orgId = getOrgId(c);
    const existing = await pages.getMainTree(orgId);
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.PAGE_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      existing?.id,
    );
    if (denied) return denied;
    const body = await c.req.json<{ pages: PageTreePageRef[] }>();
    return ok(c, await pages.upsertMainTree(orgId, body.pages));
  });

  routes.put("/page/:pageKey", async (c) => {
    const orgId = getOrgId(c);
    const pageKey = c.req.param("pageKey");
    const existing = await pages.getRoutingPage(orgId, pageKey);
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.PAGE_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      existing?.id,
    );
    if (denied) return denied;
    const body = await c.req.json<{ layoutRef: string; contentRef?: string | null }>();
    return ok(c, await pages.upsertPage(orgId, pageKey, body));
  });

  routes.get("/routing/pages", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await pages.listRoutingPages(orgId));
  });

  routes.get("/routing/pages/:pageKey", async (c) => {
    const orgId = getOrgId(c);
    const page = await pages.getRoutingPage(orgId, c.req.param("pageKey"));
    return page ? ok(c, page) : notFound(c);
  });
}
