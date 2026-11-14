import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { ProvisioningService } from "./ports";

const createSchema = z.object({
  /** Optional: when omitted the org is created from the slug. */
  orgId: z.string().min(1).optional(),
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

    const { record, created: isNew } = await provisioning.start({
      ...parsed.data,
      requestedBy: operator.userId,
    });
    const body = { orgId: record.orgId, state: record.state, steps: record.steps };
    // 202 for a new request (work is still running), 200 for an idempotent replay.
    if (!isNew) return ok(c, body);
    return c.json({ data: body }, 202);
  });

  /** Give pre-existing tenants a provisioning record; idempotent, so it is safe to run on every deploy. */
  routes.post("/backfill", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return ok(c, await provisioning.backfill());
  });

  routes.get("/:orgId/provisioning", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;

    const record = await provisioning.get(c.req.param("orgId"));
    if (!record) return c.json({ error: "No provisioning record for this tenant" }, 404);
    return ok(c, record);
  });


  /**
   * Invite the tenant's first human admin. Separate from creation on purpose: the org must exist first, and the
   * customer chooses when their admin arrives. `state=ready` means machine-ready; this step is what makes the tenant
   * usable by people.
   */
  routes.post("/:orgId/invite", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const parsed = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid invite", details: parsed.error.flatten() }, 400);

    const record = await provisioning.invite(c.req.param("orgId"), parsed.data.email);
    return ok(c, record);
  });
  return routes;
}


/**
 * Platform **operator** identity — the human who uses the console.
 *
 * Until this existed the platform org held three machine accounts and no person, so a console would have been a
 * locked room: every route behind it requires `platform_operator` on a platform-org member.
 */
export function createPlatformOperatorRoutes(deps: {
  invite: (input: { email: string }) => Promise<{ userId: string }>;
}) {
  const routes = new Hono();

  routes.post("/invite", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(PERMISSIONS.RELEASES_PLATFORM_WRITE)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const parsed = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid invite", details: parsed.error.flatten() }, 400);
    return ok(c, await deps.invite({ email: parsed.data.email }));
  });

  return routes;
}
