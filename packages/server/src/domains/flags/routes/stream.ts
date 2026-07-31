import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireHeaderOrgId } from "../../../shared/org";
import { addClient } from "../../../shared/sse-manager";
import { denyUnless } from "../../auth/deny-unless";

export function registerFlagStreamRoutes(routes: Hono): void {
  routes.get("/stream", (c) => {
    return (async () => {
      const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
      if (denied) return denied;

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
    })();
  });
}
