import "dotenv/config";
import { startTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./bootstrap";
import { initCollabRedisRelay } from "./domains/collab/collab-redis-relay";
import { initEventBus } from "./shared/event-bus";
import { startRedisFanoutMonitor } from "./shared/redis-fanout-status";
import { initSseManager } from "./shared/sse-manager";

// API entrypoint — binds HTTP. Set RUN_WORKERS=false here (paired with a separate replica set
// running worker.ts, which doesn't set it) to run this as an API-only process; see
// shared/worker-runtime.ts and worker.ts for the worker-only counterpart.
initEventBus();
initSseManager();
initCollabRedisRelay();
startRedisFanoutMonitor();

const app = await createApp();

const port = Number(process.env.PORT) || 3000;
const wss = new WebSocketServer({ noServer: true });
serve({
  fetch: app.fetch,
  port,
  websocket: { server: wss },
});
console.log(`Server running at http://localhost:${port}`);
