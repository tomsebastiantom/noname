import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { PageTreePageRef } from "../ports";
import type { DocumentsRouteDeps } from "./deps";

export function registerPageRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { pages } = deps.service;

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
    const denied = await denyUnless(c, PERMISSIONS.PAGE_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<{ pages: PageTreePageRef[] }>();
    return ok(c, await pages.upsertMainTree(orgId, body.pages));
  });

  routes.put("/page/:pageKey", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.PAGE_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<{ layoutRef: string; contentRef?: string | null }>();
    return ok(c, await pages.upsertPage(orgId, c.req.param("pageKey"), body));
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
