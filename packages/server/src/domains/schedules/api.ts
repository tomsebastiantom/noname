import { PERMISSIONS, type PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../../shared/respond";
import { requirePlatformOperator } from "../release/platform-guard";
import type { ScheduleService } from "./service";

/**
 * Schedules — read, run, and adjust jobs **defined in code**.
 *
 * There is no create endpoint on purpose: a schedule is behaviour, and behaviour is reviewed in a PR. What an
 * operator legitimately needs at runtime is here — pause it, move it, stop the dry run, or run it now.
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
    return ok(c, { schedules: await schedules.list() });
  });

  routes.get("/:name/runs", async (c) => {
    const operator = await guard(c, PERMISSIONS.PLATFORM_AUDIT_READ);
    if (operator instanceof Response) return operator;
    return ok(c, { runs: await schedules.runs(c.req.param("name")) });
  });

  routes.post("/:name/run", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    return ok(c, await schedules.execute(c.req.param("name")));
  });

  routes.post("/:name/pause", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    await schedules.setPaused(c.req.param("name"), true, operator.userId);
    return ok(c, { paused: true });
  });

  routes.post("/:name/resume", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    await schedules.setPaused(c.req.param("name"), false, operator.userId);
    return ok(c, { paused: false });
  });

  routes.put("/:name/pattern", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    const parsed = z
      .object({ pattern: z.string().nullable() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid pattern", details: parsed.error.flatten() }, 400);
    await schedules.setPattern(c.req.param("name"), parsed.data.pattern, operator.userId);
    return ok(c, { pattern: parsed.data.pattern });
  });

  routes.put("/:name/dry-run", async (c) => {
    const operator = await guard(c, PERMISSIONS.RELEASES_PLATFORM_WRITE);
    if (operator instanceof Response) return operator;
    const parsed = z.object({ dryRun: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
    await schedules.setDryRun(c.req.param("name"), parsed.data.dryRun, operator.userId);
    return ok(c, { dryRun: parsed.data.dryRun });
  });

  return routes;
}
