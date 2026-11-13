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
export function createTenantDirectoryRoutes(directory: TenantDirectoryService) {
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
