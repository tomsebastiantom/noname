import "./load-env";
import { startTracing, stopTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./bootstrap";
import { initCollabRedisRelay } from "./domains/collab/collab-redis-relay";
import { closeAllBullmqQueues } from "./shared/bullmq-queue";
import { closeAllBullmqWorkers } from "./shared/bullmq-workers";
import { initEventBus } from "./shared/event-bus";
import { beginDraining, runShutdownTasks } from "./shared/lifecycle";
import { listenWithRetry } from "./shared/listen-with-retry";
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

// A restart can overlap the previous process's drain, so the port may be held
// briefly. Retrying the bind keeps a dev reload from dying and leaving nothing
// listening while the supervisor still believes the service is up.
const PORT_RETRY_ATTEMPTS = Number(process.env.PORT_RETRY_ATTEMPTS) || 10;
const PORT_RETRY_DELAY_MS = Number(process.env.PORT_RETRY_DELAY_MS) || 300;

const wss = new WebSocketServer({ noServer: true });

const server = await listenWithRetry({
  createServer: () => serve({ fetch: app.fetch, port, websocket: { server: wss } }),
  attempts: PORT_RETRY_ATTEMPTS,
  delayMs: PORT_RETRY_DELAY_MS,
  onRetry: (attempt) =>
    console.warn(
      `[startup] port ${port} is busy (attempt ${attempt}/${PORT_RETRY_ATTEMPTS}); ` +
        `retrying in ${PORT_RETRY_DELAY_MS}ms`,
    ),
}).catch((error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[startup] Port ${port} is still in use after ${PORT_RETRY_ATTEMPTS} attempts. ` +
        "Stop the process holding the port (or change PORT) before restarting.",
    );
  } else {
    console.error(`[startup] failed to bind port ${port}: ${error.message}`);
  }
  process.exit(1);
});

// The bind succeeded, so this is no longer a port conflict: log rather than kill
// an otherwise healthy listener on a transient socket error.
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(`[server] error${error.code ? ` (${error.code})` : ""}: ${error.message}`);
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
  // Before anything else, so a load balancer polling `/ready` stops sending new requests here while
  // the drain runs rather than discovering the closed listener by failing them.
  beginDraining();
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
    // Stop producing before draining: the relay (and any future flusher) may hold in-flight work that
    // would otherwise be abandoned when the process exits.
    await runShutdownTasks();
    // Drain in-flight jobs before releasing the queues. With RUN_WORKERS=true (the default) this
    // process hosts every domain's worker, so closing queues alone left their active jobs running
    // while the process exited — a half-finished webhook delivery, email send or catalog build.
    await closeAllBullmqWorkers().catch((error) => {
      console.error("[shutdown] worker drain failed", error);
    });
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
