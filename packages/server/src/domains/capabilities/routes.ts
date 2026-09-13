import { randomUUID } from "node:crypto";
import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { getOrgId } from "../../shared/org";
import { parseBody } from "../../shared/parse-body";
import { requirePublicActor } from "../../shared/public-actor";
import { error, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { TenantSettingsService } from "../documents/ports";
import { type CapabilityIdempotencyStore, hashCapabilityRequest } from "./idempotency";
import type { CapabilityRegistry } from "./registry";

const capabilityRequestSchema = z.object({ input: z.unknown().optional() });

export function registerCapabilityRoutes(
  routes: Hono,
  registry: CapabilityRegistry,
  tenantSettings?: Pick<TenantSettingsService, "get">,
  idempotency?: CapabilityIdempotencyStore,
): void {
  routes.post("/:capability", async (c) => {
    const capability = c.req.param("capability");
    const capabilityName = capability.trim().toLowerCase();
    const publicCheckout =
      capabilityName === "commerce.checkout" && tenantSettings
        ? await requirePublicActor(c, getOrgId(c), tenantSettings)
        : null;
    if (!publicCheckout) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
    }
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return error(c, "Idempotency-Key is required", 400);
    }
    let handler: ReturnType<CapabilityRegistry["resolve"]>;
    try {
      handler = registry.resolve(capabilityName);
    } catch {
      return error(c, "Invalid capability", 400);
    }
    if (!handler) return error(c, "Capability not found", 404);
    const body = parseBody(
      capabilityRequestSchema.safeParse(await c.req.json()),
      "capability request",
    );
    const orgId = getOrgId(c);
    const requestHash = hashCapabilityRequest(body);
    if (idempotency) {
      const claim = await idempotency.claim(orgId, capabilityName, idempotencyKey, requestHash);
      if (claim.kind === "replay") return ok(c, claim.result);
      if (claim.kind === "conflict")
        return error(c, "Idempotency-Key was already used for a different request", 409);
      if (claim.kind === "in_progress")
        return error(c, "A request with this Idempotency-Key is already in progress", 409);
    }
    try {
      const result = await handler(body.input, {
        orgId,
        actorId: c.req.header("x-user-id")?.trim() || undefined,
        requestId: c.req.header("x-request-id")?.trim() || randomUUID(),
        idempotencyKey,
      });
      if (idempotency) await idempotency.complete(orgId, capabilityName, idempotencyKey, result);
      return ok(c, result);
    } catch (cause) {
      if (idempotency) {
        await idempotency.fail(orgId, capabilityName, idempotencyKey, {
          message: cause instanceof Error ? cause.message : "Capability failed",
          status:
            typeof cause === "object" && cause !== null && "httpStatus" in cause
              ? Number((cause as { httpStatus?: unknown }).httpStatus)
              : undefined,
        });
      }
      throw cause;
    }
  });
}
