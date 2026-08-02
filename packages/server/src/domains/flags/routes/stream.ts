import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireHeaderOrgId } from "../../../shared/org";
import { addClient } from "../../../shared/sse-manager";

/** Anonymous storefront SSE — EventSource cannot send Authorization headers. */
export function registerFlagStreamRoutes(routes: Hono): void {
  routes.get("/stream", (c) => {
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;

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

      while (true) {
        await stream.sleep(30_000);
      }
    });
  });
}
