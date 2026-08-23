import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireHeaderOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { addClient } from "../../../shared/sse-manager";
import { mintStreamTicket, verifyStreamTicket } from "../../notifications/stream-ticket";

/**
 * Anonymous storefront SSE — EventSource cannot send Authorization or x-org-id
 * headers, so the SDK first mints a short-lived signed ticket via
 * POST /stream/ticket (a fetch, which can carry headers) and connects with
 * `GET /stream?stream_ticket=...`.
 */
export function registerFlagStreamRoutes(routes: Hono): void {
  routes.post("/stream/ticket", (c) => {
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;

    try {
      // Empty userId — flag streams are anonymous (per-org, not per-user).
      return ok(c, mintStreamTicket("", orgId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream ticket unavailable";
      return c.json({ error: message }, 503);
    }
  });

  routes.get("/stream", (c) => {
    let orgId: string;
    const streamTicket = c.req.query("stream_ticket")?.trim();
    if (streamTicket) {
      const parsed = verifyStreamTicket(streamTicket);
      if (!parsed?.orgId) {
        return c.json({ error: "Invalid or expired stream ticket" }, 401);
      }
      orgId = parsed.orgId;
    } else {
      const headerOrgId = requireHeaderOrgId(c);
      if (headerOrgId instanceof Response) return headerOrgId;
      orgId = headerOrgId;
    }

    return streamSSE(c, async (stream) => {
      addClient(orgId, stream);

      stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });

      const heartbeat = setInterval(() => {
        try {
          stream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) });
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      stream.onAbort(() => clearInterval(heartbeat));

      while (!stream.aborted) {
        await stream.sleep(30_000);
      }
    });
  });
}
