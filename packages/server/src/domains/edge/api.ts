import { Hono } from "hono";
import { getOrgId, getUserId } from "../../shared/org";
import { error, notFound, ok } from "../../shared/respond";
import { resolveSiteIdToOrgId } from "../../shared/site-id";
import type { TenantSettingsService } from "../documents/ports";
import type { EdgeService } from "./ports";

const EDGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEdgeRoutes(service: EdgeService, tenantSettings: TenantSettingsService) {
  const routes = new Hono();

  routes.get("/schema/:siteId", async (c) => {
    const siteId = c.req.param("siteId");
    const orgId = getOrgId(c) || (await resolveSiteIdToOrgId(tenantSettings, siteId));
    if (!orgId) return notFound(c);

    const schema = await service.getSchema(orgId, {
      template: c.req.query("template") || undefined,
      url: c.req.query("url") ?? undefined,
      contentRef: c.req.query("contentRef") ?? undefined,
      locale: c.req.query("locale") ?? undefined,
      verifiedUserId: getUserId(c) || null,
      sessionId: c.req.header("x-session-id") ?? null,
      edit: c.req.query("edit") === "true",
    });
    return ok(c, schema);
  });

  routes.post("/experience/rendered", async (c) => {
    const userId = getUserId(c);
    if (!userId) return error(c, "Verified account required", 401);
    const sessionId = c.req.header("x-session-id")?.trim() ?? "";
    if (!EDGE_UUID_RE.test(sessionId)) return error(c, "Valid session id required", 400);

    let decisionId: unknown;
    try {
      const body = await c.req.json<{ decisionId?: unknown }>();
      decisionId = body.decisionId;
    } catch {
      return error(c, "Invalid experience render confirmation", 400);
    }
    if (typeof decisionId !== "string" || !EDGE_UUID_RE.test(decisionId)) {
      return error(c, "Invalid experience render confirmation", 400);
    }

    const accepted = await service.recordExperienceRendered(
      getOrgId(c),
      userId,
      sessionId,
      decisionId,
    );
    return accepted ? ok(c, { accepted: true }) : notFound(c);
  });

  return routes;
}
