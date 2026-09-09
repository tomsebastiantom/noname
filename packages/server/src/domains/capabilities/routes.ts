import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { PERMISSIONS } from "@noname/auth";
import { z } from "zod";
import { denyUnless } from "../auth/deny-unless";
import { parseBody } from "../../shared/parse-body";
import { error, ok } from "../../shared/respond";
import { getOrgId } from "../../shared/org";
import type { CapabilityRegistry } from "./registry";

const capabilityRequestSchema = z.object({ input: z.unknown().optional() });

export function registerCapabilityRoutes(routes: Hono, registry: CapabilityRegistry): void {
  routes.post("/:capability", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return error(c, "Idempotency-Key is required", 400);
    }
    let handler: ReturnType<CapabilityRegistry["resolve"]>;
    try {
      handler = registry.resolve(c.req.param("capability"));
    } catch {
      return error(c, "Invalid capability", 400);
    }
    if (!handler) return error(c, "Capability not found", 404);
    const body = parseBody(capabilityRequestSchema.safeParse(await c.req.json()), "capability request");
    const result = await handler(body.input, {
      orgId: getOrgId(c),
      actorId: c.req.header("x-user-id")?.trim() || undefined,
      requestId: c.req.header("x-request-id")?.trim() || randomUUID(),
      idempotencyKey,
    });
    return ok(c, result);
  });
}
