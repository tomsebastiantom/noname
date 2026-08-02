import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { CreateLayoutInput } from "../ports";
import type { DocumentsRouteDeps } from "./deps";
import { layoutFiltersFrom } from "./helpers";

export function registerLayoutRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { layout } = deps.service;

  routes.post("/layout", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.LAYOUT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<CreateLayoutInput>();
    const createdLayout = await layout.create(orgId, {
      templateName: body.templateName,
      segment: body.segment,
      spec: body.spec,
      renderAs: body.renderAs,
      shellRef: body.shellRef,
    });
    return created(c, createdLayout);
  });

  routes.get("/layout", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await layout.list(orgId, layoutFiltersFrom(c.req.query())));
  });

  routes.get("/layout/:id", async (c) => {
    const orgId = getOrgId(c);
    const found = await layout.get(orgId, c.req.param("id"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/layout/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.LAYOUT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<{
      spec: Record<string, unknown>;
      contentRef?: string | null;
      renderAs?: "standalone" | "shell" | "panel";
      shellRef?: string | null;
    }>();
    const ifMatch = c.req.header("If-Match");
    const updated = await layout.update(
      orgId,
      c.req.param("id"),
      {
        spec: body.spec,
        contentRef: body.contentRef,
        renderAs: body.renderAs,
        shellRef: body.shellRef,
      },
      ifMatch ? { ifMatchUpdatedAt: ifMatch } : undefined,
    );
    return ok(c, updated);
  });

  routes.put("/layout/:id/publish", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.LAYOUT_PUBLISH);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const published = await layout.publish(orgId, c.req.param("id"));
    return ok(c, published);
  });

  routes.put("/layout/:id/archive", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.LAYOUT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const archived = await layout.archive(orgId, c.req.param("id"));
    return ok(c, archived);
  });

  routes.put("/layout/:id/variants", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.LAYOUT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { segment, overrides } = await c.req.json<{
      segment: string;
      overrides: Record<string, unknown>;
    }>();
    const variant = await layout.addVariant(orgId, c.req.param("id"), segment, overrides);
    return created(c, variant);
  });

  routes.get("/layout/:templateName/resolve", async (c) => {
    const orgId = getOrgId(c);
    const resolved = await layout.resolve(
      orgId,
      c.req.param("templateName"),
      c.req.query("segment") || "default",
    );
    return resolved ? ok(c, resolved) : notFound(c);
  });
}
