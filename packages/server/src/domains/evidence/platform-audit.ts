import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { EvidenceService } from "./ports";

const querySchema = z.object({
  orgId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  actorType: z.enum(["user", "service", "provider", "system"]).optional(),
  actorId: z.string().min(1).optional(),
  subjectType: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  format: z.enum(["json", "ndjson"]).optional(),
});

/**
 * Platform audit stream — roadmap step 7.
 *
 * Tenant audit answers "what happened to my store". This answers "what did the operator do across tenants", which
 * is the question an SOC 2 auditor asks about a wave. It is platform-only in three independent ways: the platform
 * org, the `platform_operator` role, and `PLATFORM_AUDIT_READ` (which no tenant role may hold).
 */
export function createPlatformAuditRoutes(evidence: EvidenceService) {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.PLATFORM_AUDIT_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", details: parsed.error.flatten() }, 400);
    }
    const { format, ...filters } = parsed.data;

    const events = await evidence.listAuditAcross({
      ...(filters.orgId ? { orgId: filters.orgId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorType ? { actorType: filters.actorType } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.subjectType ? { subjectType: filters.subjectType } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.limit ? { limit: filters.limit } : {}),
    });

    if (format !== "ndjson") {
      return ok(c, { count: events.length, events });
    }

    // NDJSON: one JSON object per line, which is what SIEM ingestion and `jq -c` expect. Nothing else may be
    // written to the body — a trailing summary would corrupt the stream.
    const body = events.map((event) => JSON.stringify(event)).join("\n");
    return c.body(events.length > 0 ? `${body}\n` : "", 200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="platform-audit-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    });
  });

  return routes;
}
