import { userIdFromAccessToken } from "@noname/auth";
import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getOrgId, getUserId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { addClient } from "../../../shared/sse-manager";
import { requireAuthenticatedUser, resolveAccessToken } from "../../auth/guards";
import { mintStreamTicket, verifyStreamTicket } from "../stream-ticket";

function resolveStreamAuth(c: Context): { userId: string; orgId: string } | Response {
  const streamTicket = c.req.query("stream_ticket")?.trim();
  if (streamTicket) {
    const parsed = verifyStreamTicket(streamTicket);
    if (!parsed) {
      return c.json({ error: "Invalid or expired stream ticket" }, 401);
    }
    const orgId = getOrgId(c) || parsed.orgId;
    if (orgId !== parsed.orgId) {
      return c.json({ error: "Stream ticket org mismatch" }, 403);
    }
    return { userId: parsed.userId, orgId };
  }

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

  return { userId, orgId };
}

/** Authenticated SSE — inbox updates for the signed-in user (admin or storefront account). */
export function registerNotificationsStreamRoutes(routes: Hono): void {
  routes.post("/stream/ticket", (c) => {
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org required" }, 400);
    }

    const userId = getUserId(c) || auth.userId;
    try {
      return ok(c, mintStreamTicket(userId, orgId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream ticket unavailable";
      return c.json({ error: message }, 503);
    }
  });

  routes.get("/stream", (c) => {
    const auth = resolveStreamAuth(c);
    if (auth instanceof Response) return auth;
    const { userId, orgId } = auth;

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
