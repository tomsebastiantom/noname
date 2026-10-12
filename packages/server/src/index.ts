import "./load-env";
import { startTracing, stopTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./bootstrap";
import { closeAllBullmqQueues } from "./shared/bullmq-queue";
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
const server = serve({
  fetch: app.fetch,
  port,
  websocket: { server: wss },
});

/**
 * A stale listener is the difference between a clean reload and a process that
 * dies on start (EADDRINUSE) while the supervisor believes it is healthy.
 */
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[startup] Port ${port} is already in use by another process. ` +
        "Stop the process holding the port (or change PORT) before restarting.",
    );
    process.exit(1);
  }
  throw error;
});

console.log(`Server running at http://localhost:${port}`);

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000;
let shuttingDown = false;

/**
 * Stop accepting work, then drain. Without this the process leaves its listener
 * bound (so the next start fails with EADDRINUSE) and abandons in-flight jobs.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received; draining (timeout ${SHUTDOWN_TIMEOUT_MS}ms)`);

  const force = setTimeout(() => {
    console.error("[shutdown] timed out; forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    // Stop accepting, then drop long-lived SSE/WebSocket connections so the
    // close() promise can settle instead of waiting for the shutdown timeout.
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    const draining = server as unknown as { closeAllConnections?: () => void };
    draining.closeAllConnections?.();
    await closed;
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await closeAllBullmqQueues().catch((error) => {
      console.error("[shutdown] queue drain failed", error);
    });
    await stopTracing().catch(() => undefined);
  } catch (error) {
    console.error("[shutdown] drain failed", error);
  } finally {
    clearTimeout(force);
  }

  console.log("[shutdown] complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
