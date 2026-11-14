import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { created, ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { ProvisioningService } from "./ports";

const createSchema = z.object({
  orgId: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase, digits and dashes only"),
  /** Same key twice must not create two tenants. Callers pass something stable, e.g. the request id. */
  idempotencyKey: z.string().min(8).max(200),
  seed: z.boolean().optional(),
});

/**
 * Tenant provisioning — the single way a tenant is created.
 *
 * `POST` answers **202** with the record, never 201-with-everything-done: identity steps are external and slow, and a
 * request thread holding them open is how duplicate tenants appear on retry. The caller polls `GET …/provisioning`.
 */
export function createTenantProvisioningRoutes(provisioning: ProvisioningService) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid tenant", details: parsed.error.flatten() }, 400);
    }

    const record = await provisioning.start({
      ...parsed.data,
      requestedBy: operator.userId,
    });
    return created(c, { orgId: record.orgId, state: record.state, steps: record.steps });
  });

  routes.get("/:orgId/provisioning", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;

    const record = await provisioning.get(c.req.param("orgId"));
    if (!record) return c.json({ error: "No provisioning record for this tenant" }, 404);
    return ok(c, record);
  });

  return routes;
}
