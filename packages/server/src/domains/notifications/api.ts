import { Hono } from "hono";
import { z } from "zod";
import { getOrgId, getUserId } from "../../shared/org";
import { parseBody } from "../../shared/parse-body";
import { ok } from "../../shared/respond";
import { requireAuthenticatedUser } from "../auth/guards";
import type { NotificationsService } from "./ports";

const preferencesUpdateSchema = z.object({
  agentTaskEmail: z.boolean().optional(),
  marketingEmail: z.boolean().optional(),
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
      preferencesUpdateSchema.safeParse(await c.req.json()),
      "notification preferences",
    );
    return ok(c, await service.updatePreferences(orgId, userId, body));
  });

  return routes;
}
