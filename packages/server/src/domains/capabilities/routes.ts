import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { parseBody } from "../../shared/parse-body";
import { requirePublicActor } from "../../shared/public-actor";
import { error, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { TenantSettingsService } from "../documents/ports";
import { type CapabilityIdempotencyStore, hashCapabilityRequest } from "./idempotency";
import type { CapabilityContext, CapabilityRegistry } from "./registry";

const capabilityRequestSchema = z.object({ input: z.unknown().optional() });

export interface CapabilityRouteOptions {
  isExtensionInstalled?: (orgId: string, extension: string) => Promise<boolean>;
}

export function registerCapabilityRoutes(
  routes: Hono,
  registry: CapabilityRegistry,
  tenantSettings?: Pick<TenantSettingsService, "get">,
  idempotency?: CapabilityIdempotencyStore,
  options: CapabilityRouteOptions = {},
): void {
  routes.post("/:capability", async (c) => {
    const capabilityName = c.req.param("capability").trim().toLowerCase();
    let definition: ReturnType<CapabilityRegistry["definition"]>;
    try {
      definition = registry.definition(capabilityName);
    } catch {
      return error(c, "Invalid capability", 400);
    }
    if (!definition) return error(c, "Capability not found", 404);

    const body = parseBody(
      capabilityRequestSchema.safeParse(await c.req.json()),
      "capability request",
    );
    const orgId = getOrgId(c);
    const actorId = getUserId(c)?.trim() || undefined;
    const requestId = c.req.header("x-request-id")?.trim() || randomUUID();
    const providedKey = c.req.header("Idempotency-Key")?.trim();

    // Queries always execute against current state and are never replayed from
    // the command-result idempotency store. A request key remains part of the
    // handler context for backward-compatible tracing, but is not required.
    if (definition.kind === "command" && (!providedKey || providedKey.length > 200)) {
      return error(c, "Idempotency-Key is required", 400);
    }
    if (providedKey && providedKey.length > 200) {
      return error(c, "Idempotency-Key is too long", 400);
    }
    const idempotencyKey = providedKey || requestId;

    let publicActorAllowed = false;
    if (definition.publicAccess === "publishable-key" && !actorId) {
      const publicActor = tenantSettings
        ? await requirePublicActor(c, orgId, tenantSettings)
        : null;
      if (!publicActor) return error(c, "Authentication required", 401);
      publicActorAllowed = true;
    }
    if (!publicActorAllowed) {
      if (!definition.permission) return error(c, "Capability policy is incomplete", 403);
      const denied = await denyUnless(c, definition.permission);
      if (denied) return denied;
    }

    if (definition.extension) {
      if (!options.isExtensionInstalled) {
        return error(c, "Capability is unavailable", 403);
      }
      let installed = false;
      try {
        installed = await options.isExtensionInstalled(orgId, definition.extension);
      } catch {
        installed = false;
      }
      if (!installed) return error(c, "Capability is unavailable", 403);
    }

    const context: CapabilityContext = { orgId, actorId, requestId, idempotencyKey };
    if (definition.authorize) {
      let allowed = false;
      try {
        allowed = await definition.authorize(body.input, context);
      } catch {
        allowed = false;
      }
      if (!allowed) return error(c, "Resource not found", 404);
    }

    const usesIdempotency = definition.kind === "command" && idempotency !== undefined;
    if (definition.kind === "command" && !idempotency) {
      return error(c, "Command idempotency is unavailable", 503);
    }
    const requestHash = hashCapabilityRequest(actorId ? { body, actorId } : body);
    let claimToken: string | undefined;
    if (usesIdempotency) {
      const claim = await idempotency.claim(orgId, capabilityName, idempotencyKey, requestHash);
      if (claim.kind === "replay") return ok(c, claim.result);
      if (claim.kind === "conflict")
        return error(c, "Idempotency-Key was already used for a different request", 409);
      if (claim.kind === "in_progress")
        return error(c, "A request with this Idempotency-Key is already in progress", 409);
      claimToken = claim.claimToken;
    }

    try {
      const result = await definition.handler(body.input, context);
      if (usesIdempotency && claimToken) {
        await idempotency.complete(orgId, capabilityName, idempotencyKey, claimToken, result);
      }
      return ok(c, result);
    } catch (cause) {
      if (usesIdempotency && claimToken) {
        await idempotency.fail(orgId, capabilityName, idempotencyKey, claimToken, {
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
