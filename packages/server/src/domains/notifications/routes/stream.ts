import { userIdFromAccessToken } from "@noname/auth";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getOrgId, getUserId } from "../../../shared/org";
import { addClient } from "../../../shared/sse-manager";
import { resolveAccessToken } from "../../auth/guards";

/** Authenticated SSE — inbox updates for the signed-in user (admin or storefront account). */
export function registerNotificationsStreamRoutes(routes: Hono): void {
  routes.get("/stream", (c) => {
    const userToken = resolveAccessToken(c);
    if (!userToken) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const userId = getUserId(c) || userIdFromAccessToken(userToken) || "";
    if (!userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org and user required" }, 400);
    }

    return streamSSE(c, async (stream) => {
      addClient(orgId, stream, userId);

      stream.writeSSE({
        data: JSON.stringify({ type: "connected", userId }),
      });

      const heartbeat = setInterval(() => {
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) });
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      stream.onAbort(() => clearInterval(heartbeat));

      while (true) {
        await stream.sleep(30_000);
      }
    });
  });
}
