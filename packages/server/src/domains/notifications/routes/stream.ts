import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getOrgId, getUserId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { subscribe, userTopic } from "../../../shared/sse-manager";
import { requireAuthenticatedUser, resolveAccessToken } from "../../auth/guards";
import { verifiedTokenPayload } from "../../auth/verified-token";
import { mintStreamTicket, verifyStreamTicket } from "../stream-ticket";

async function resolveStreamAuth(
  c: Context,
): Promise<{ userId: string; orgId: string } | Response> {
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

  // The `?access_token=` form is readable by the caller, so it must be
  // signature-verified before it becomes a stream identity.
  const payload = await verifiedTokenPayload(c, userToken);
  const verifiedSub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  const userId = getUserId(c) || verifiedSub;
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
  routes.post("/stream/ticket", async (c) => {
    const auth = await requireAuthenticatedUser(c);
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

  routes.get("/stream", async (c) => {
    const auth = await resolveStreamAuth(c);
    if (auth instanceof Response) return auth;
    const { userId, orgId } = auth;

    return streamSSE(c, async (stream) => {
      // The topic is the authenticated user's own inbox. A caller cannot subscribe elsewhere, so
      // another user's notifications are unreachable by construction rather than by a delivery check.
      subscribe(userTopic(orgId, userId), stream);

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
