import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { parseBody } from "../../shared/parse-body";
import { ok } from "../../shared/respond";
import { requireAuthenticatedUser, requireHumanPermission } from "../auth/guards";
import type { NotificationsService } from "./ports";
import { notificationPreferencesUpdateSchema } from "./preferences";
import { registerCommsWebhookRoutes } from "./routes/webhooks";
import { registerNotificationsStreamRoutes } from "./routes/stream";

const listDeliveriesSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeEvents: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const listInboxSchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function createNotificationsRoutes(service: NotificationsService) {
  const routes = new Hono();

  routes.get("/preferences", async (c) => {
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const userId = getUserId(c) || auth.userId;
    if (!orgId || !userId) {
      return c.json({ error: "org and user required" }, 400);
    }
    return ok(c, await service.getPreferences(orgId, userId));
  });

  routes.put("/preferences", async (c) => {
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const userId = getUserId(c) || auth.userId;
    if (!orgId || !userId) {
      return c.json({ error: "org and user required" }, 400);
    }
    const body = parseBody(
      notificationPreferencesUpdateSchema.safeParse(await c.req.json()),
      "notification preferences",
    );
    return ok(c, await service.updatePreferences(orgId, userId, body));
  });

  routes.get("/deliveries", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org required" }, 400);
    }

    const query = listDeliveriesSchema.safeParse({
      status: c.req.query("status"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      includeEvents: c.req.query("includeEvents"),
    });
    if (!query.success) {
      return c.json({ error: "Invalid query" }, 400);
    }

    return ok(c, await service.listDeliveries(orgId, query.data));
  });

  routes.post("/deliveries/:deliveryId/retry", async (c) => {
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org required" }, 400);
    }

    try {
      return ok(c, await service.retryDelivery(orgId, c.req.param("deliveryId")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "retry failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.get("/inbox", async (c) => {
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const userId = getUserId(c) || auth.userId;
    if (!orgId || !userId) {
      return c.json({ error: "org and user required" }, 400);
    }

    const query = listInboxSchema.safeParse({
      unreadOnly: c.req.query("unreadOnly"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    if (!query.success) {
      return c.json({ error: "Invalid query" }, 400);
    }

    return ok(c, await service.listInbox(orgId, userId, query.data));
  });

  routes.post("/inbox/:itemId/read", async (c) => {
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const userId = getUserId(c) || auth.userId;
    if (!orgId || !userId) {
      return c.json({ error: "org and user required" }, 400);
    }

    const item = await service.markInboxRead(orgId, userId, c.req.param("itemId"));
    if (!item) {
      return c.json({ error: "Not found" }, 404);
    }
    return ok(c, item);
  });

  registerNotificationsStreamRoutes(routes);
  registerCommsWebhookRoutes(routes, service);

  return routes;
}
