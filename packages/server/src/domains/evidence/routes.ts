import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId } from "../../shared/org";
import { error, ok } from "../../shared/respond";
import type { EvidenceService } from "./ports";

export function createEvidenceRoutes(service: EvidenceService) {
  const routes = new Hono();

  // Writers use the server-side EvidenceService port. No browser-facing write route exists:
  // domain extensions must validate their own payloads and preserve business invariants.
  routes.get("/records", async (c) => {
    const orgId = requireOrg(c);
    if (orgId instanceof Response) return orgId;
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limitParam && (limit === undefined || !Number.isInteger(limit) || limit < 1)) {
      return error(c, "limit must be a positive integer", 400);
    }
    const records = await service.listRecords({
      orgId,
      type: c.req.query("type"),
      subjectType: c.req.query("subjectType"),
      subjectId: c.req.query("subjectId"),
      limit,
    });
    return ok(c, records);
  });

  routes.get("/links/:recordId", async (c) => {
    const orgId = requireOrg(c);
    if (orgId instanceof Response) return orgId;
    const recordId = c.req.param("recordId");
    if (!z.string().uuid().safeParse(recordId).success) return error(c, "invalid record id", 400);
    return ok(c, await service.listLinks(orgId, recordId));
  });

  routes.get("/audit", async (c) => {
    const orgId = requireOrg(c);
    if (orgId instanceof Response) return orgId;
    return ok(
      c,
      await service.listAudit(orgId, c.req.query("subjectType"), c.req.query("subjectId")),
    );
  });

  return routes;
}

function requireOrg(c: Context): string | Response {
  const orgId = getOrgId(c);
  return orgId || error(c, "org id required", 400);
}
