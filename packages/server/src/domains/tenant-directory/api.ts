import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { TenantDirectoryService } from "./ports";
import { TENANT_STATUSES } from "./schema";

const listQuery = z.object({
  status: z.enum(TENANT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const upsertSchema = z.object({
  orgId: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(TENANT_STATUSES).optional(),
  plan: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  excludedReason: z.string().nullable().optional(),
  isPlatform: z.boolean().optional(),
});

/**
 * Platform-only tenant inventory.
 *
 * Every route passes `requirePlatformOperator`: the platform org, the `platform_operator` role, and — because a
 * service account's roles are not in the token — server-side grant resolution. Tenant admins get 403 here; the
 * tenant-facing `/api/tenants/*` routes stay as they are.
 */
export function createTenantDirectoryRoutes(
  directory: TenantDirectoryService,
  verdict?: (input: {
    orgId: string;
    checksVersion?: string | null;
  }) => Promise<{ status: "pass" | "block" | "unverified" | "missing"; reason?: string }>,
  rollback?: (input: { orgId: string; actorId: string }) => Promise<unknown>,
  history?: (input: { orgId: string; limit?: number }) => Promise<unknown[]>,
  acknowledge?: (input: {
    orgId: string;
    releaseId: string;
    reason: string;
    checksVersion?: string;
    actorId: string;
  }) => Promise<{ recorded: true }>,
) {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", details: parsed.error.flatten() }, 400);
    }
    const tenants = await directory.list({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      excludePlatform: true,
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
    });
    return ok(c, { tenants });
  });

  routes.get("/:orgId", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const entry = await directory.get(c.req.param("orgId"));
    if (!entry) return c.json({ error: "Unknown tenant" }, 404);
    return ok(c, entry);
  });

  /** Accept an `unverified` verdict: recorded as evidence, never as a pass. */
  routes.post("/:orgId/verdict/ack", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    const body = await c.req.json().catch(() => null);
    const parsed = z
      .object({ releaseId: z.string().min(1), reason: z.string().min(3), checksVersion: z.string().optional() })
      .safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid acknowledgement", details: parsed.error.flatten() }, 400);
    if (!acknowledge) return c.json({ error: "Verdict acknowledgement is not configured" }, 503);
    await acknowledge({ ...parsed.data, orgId: c.req.param("orgId"), actorId: operator.userId });
    return ok(c, { acknowledged: true });
  });

  /**
   * Roll a tenant back to its previous release.
   *
   * `pointer.rollback` already takes an explicit org, so this is a guarded route rather than new logic — the only
   * thing that was missing was a platform-scoped way to name the tenant.
   */
  routes.post("/:orgId/rollback", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!rollback) return c.json({ error: "Rollback is not configured" }, 503);
    return ok(c, await rollback({ orgId: c.req.param("orgId"), actorId: operator.userId }));
  });

  /** The tenant's release history, read from its own audit stream. */
  routes.get("/:orgId/history", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!history) return c.json({ error: "History is not configured" }, 503);
    return ok(c, await history({ orgId: c.req.param("orgId"), limit: 50 }));
  });

  routes.get("/:orgId/verdict", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_READ)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!verdict) return c.json({ error: "Verdict lookup is not configured" }, 503);

    const entry = await directory.get(c.req.param("orgId"));
    if (!entry) return c.json({ error: "Unknown tenant" }, 404);

    const checksVersion = c.req.query("checksVersion")?.trim() || null;
    const result = await verdict({ orgId: entry.orgId, checksVersion });
    return ok(c, { orgId: entry.orgId, checksVersion, ...result });
  });

  /** Create or update a directory row. Used by onboarding and by the backfill of existing orgs. */
  routes.put("/:orgId", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = upsertSchema.safeParse({
      ...(await c.req.json().catch(() => null)),
      orgId: c.req.param("orgId"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid tenant", details: parsed.error.flatten() }, 400);
    }
    return ok(c, await directory.upsert(parsed.data));
  });

  return routes;
}
