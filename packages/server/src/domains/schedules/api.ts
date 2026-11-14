import { PERMISSIONS, type PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { ScheduleService } from "./service";

/**
 * Schedules — instances of definitions that live in code.
 *
 * Creating a schedule is allowed here; creating a *capability* is not. The definition is validated against
 * `SCHEDULE_DEFINITIONS`, so a schedule can only ever point at behaviour someone wrote and reviewed.
 */
export function createScheduleRoutes(schedules: ScheduleService) {
  const routes = new Hono();

  const guard = async (c: Context, permission: PermissionKey) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    if (!operator.permissions.includes(permission)) return c.json({ error: "Forbidden" }, 403);
    return operator;
  };

  routes.get("/", async (c) => {
    const operator = await guard(c, PERMISSIONS.PLATFORM_AUDIT_READ);
    if (operator instanceof Response) return operator;
    return ok(c, await schedules.list());
  });

  routes.post("/", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    const parsed = z
      .object({
        definition: z.string().min(1),
        pattern: z.string().min(1),
        label: z.string().max(80).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid schedule", details: parsed.error.flatten() }, 400);

    const created = await schedules.create({ ...parsed.data, actorId: operator.userId });
    return ok(c, created);
  });

  routes.delete("/:id", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    await schedules.remove(c.req.param("id"), operator.userId);
    return ok(c, { deleted: true });
  });

  routes.get("/:id/runs", async (c) => {
    const operator = await guard(c, PERMISSIONS.PLATFORM_AUDIT_READ);
    if (operator instanceof Response) return operator;
    return ok(c, { runs: await schedules.runs(c.req.param("id")) });
  });

  routes.post("/:id/run", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    return ok(c, await schedules.execute(c.req.param("id")));
  });

  for (const [action, paused] of [
    ["pause", true],
    ["resume", false],
  ] as const) {
    routes.post(`/:id/${action}`, async (c) => {
      const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
      if (operator instanceof Response) return operator;
      await schedules.setPaused(c.req.param("id"), paused, operator.userId);
      return ok(c, { paused });
    });
  }

  routes.put("/:id/pattern", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    const parsed = z.object({ pattern: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid pattern", details: parsed.error.flatten() }, 400);
    await schedules.setPattern(c.req.param("id"), parsed.data.pattern, operator.userId);
    return ok(c, { pattern: parsed.data.pattern });
  });

  routes.put("/:id/dry-run", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    const parsed = z.object({ dryRun: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
    await schedules.setDryRun(c.req.param("id"), parsed.data.dryRun, operator.userId);
    return ok(c, { dryRun: parsed.data.dryRun });
  });

  return routes;
}
