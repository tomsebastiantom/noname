import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { getOrgId } from "../../../shared/org";
import { parseBody } from "../../../shared/parse-body";
import { created, ok } from "../../../shared/respond";
import { requireHumanPermission } from "../../auth/guards";
import type { WebhooksService } from "../ports";

const upsertSubscriptionSchema = z.object({
  url: z.string().url().max(2048),
  eventTypes: z.array(z.string().trim().min(1).max(128)).min(1).max(50),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
  signingSecret: z.string().min(16).max(256).optional(),
});

const deliverOutboundSchema = z.object({
  eventType: z.string().trim().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
  eventId: z.string().trim().min(1).max(128).optional(),
});

export function registerWebhookSubscriptionRoutes(routes: Hono, service: WebhooksService): void {
  routes.get("/subscriptions", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);
    return ok(c, await service.listSubscriptions(orgId));
  });

  routes.post("/subscriptions", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    const body = parseBody(
      upsertSubscriptionSchema.safeParse(await c.req.json()),
      "webhook subscription",
    );

    try {
      return created(c, await service.upsertSubscription(orgId, null, body, auth.userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "create failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.put("/subscriptions/:subscriptionId", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    const body = parseBody(
      upsertSubscriptionSchema.safeParse(await c.req.json()),
      "webhook subscription",
    );

    try {
      return ok(
        c,
        await service.upsertSubscription(orgId, c.req.param("subscriptionId"), body, auth.userId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "update failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.delete("/subscriptions/:subscriptionId", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    try {
      await service.deleteSubscription(orgId, c.req.param("subscriptionId"));
      return ok(c, { deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "delete failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.get("/outbound/deliveries", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    const limit = Number(c.req.query("limit") ?? "50");
    return ok(c, await service.listOutboundDeliveries(orgId, limit));
  });

  routes.post("/outbound/deliveries", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    const body = parseBody(
      deliverOutboundSchema.safeParse(await c.req.json()),
      "webhook outbound delivery",
    );

    try {
      return ok(
        c,
        await service.deliverOutbound(orgId, body.eventType, body.payload, body.eventId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "deliver failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/outbound/deliveries/:deliveryId/retry", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);

    try {
      return ok(c, await service.retryOutboundDelivery(orgId, c.req.param("deliveryId")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "retry failed";
      return c.json({ error: message }, 400);
    }
  });
}
