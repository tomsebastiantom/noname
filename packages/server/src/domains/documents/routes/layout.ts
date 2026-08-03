import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import { denyUnlessTagsAccess } from "../../auth/deny-unless-document-access";
import { requirePermission } from "../../auth/guards";
import type { CreateLayoutInput } from "../ports";
import { normalizeTags } from "../shared/document-tags";
import type { DocumentsRouteDeps } from "./deps";
import { denyUnlessDocumentPublish, denyUnlessDocumentWrite } from "./document-write-guard";
import { layoutFiltersFrom } from "./helpers";

export function registerLayoutRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { layout } = deps.service;
  const { storage, authorization } = deps;

  routes.post("/layout", async (c) => {
    const auth = await requirePermission(c, PERMISSIONS.LAYOUT_DRAFT_WRITE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const body = await c.req.json<CreateLayoutInput>();
    const tags = normalizeTags(body.tags);
    const tagDenied = await denyUnlessTagsAccess(c, auth, authorization, tags, "edit");
    if (tagDenied) return tagDenied;
    const createdLayout = await layout.create(orgId, {
      templateName: body.templateName,
      segment: body.segment,
      spec: body.spec,
      renderAs: body.renderAs,
      shellRef: body.shellRef,
      tags,
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
    const orgId = getOrgId(c);
    const layoutId = c.req.param("id");
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.LAYOUT_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      layoutId,
    );
    if (denied) return denied;
    const body = await c.req.json<{
      spec: Record<string, unknown>;
      contentRef?: string | null;
      renderAs?: "standalone" | "shell" | "panel" | "editor";
      shellRef?: string | null;
      tags?: string[];
    }>();
    const ifMatch = c.req.header("If-Match");
    const updated = await layout.update(
      orgId,
      layoutId,
      {
        spec: body.spec,
        contentRef: body.contentRef,
        renderAs: body.renderAs,
        shellRef: body.shellRef,
        tags: body.tags,
      },
      ifMatch ? { ifMatchUpdatedAt: ifMatch } : undefined,
    );
    return ok(c, updated);
  });

  routes.put("/layout/:id/publish", async (c) => {
    const orgId = getOrgId(c);
    const layoutId = c.req.param("id");
    const denied = await denyUnlessDocumentPublish(
      c,
      PERMISSIONS.LAYOUT_PUBLISH,
      authorization,
      storage,
      orgId,
      layoutId,
    );
    if (denied) return denied;
    const published = await layout.publish(orgId, layoutId);
    return ok(c, published);
  });

  routes.put("/layout/:id/archive", async (c) => {
    const orgId = getOrgId(c);
    const layoutId = c.req.param("id");
    const denied = await denyUnlessDocumentWrite(
      c,
      PERMISSIONS.LAYOUT_DRAFT_WRITE,
      authorization,
      storage,
      orgId,
      layoutId,
    );
    if (denied) return denied;
    const archived = await layout.archive(orgId, layoutId);
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
