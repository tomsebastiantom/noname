import "dotenv/config";
import { startTracing } from "./tracing";

startTracing();

import { createApp } from "./bootstrap";
import { initCollabRedisRelay } from "./domains/collab/collab-redis-relay";
import { initEventBus } from "./shared/event-bus";
import { startRedisFanoutMonitor } from "./shared/redis-fanout-status";

/**
 * Worker entrypoint — never binds HTTP. Runs the exact same domain wiring as `index.ts` (that's
 * where each domain's BullMQ worker is started as a side effect of construction — see
 * `domains/*\/index.ts`), but stops short of `serve()`, so no port is bound and this process
 * does nothing but process queued jobs.
 *
 * Pair with `RUN_WORKERS=false` on the API replicas (index.ts) so the two scale independently:
 * this process's DB pool and event loop are spent entirely on job processing (agent
 * orchestration, webhook/email delivery, catalog builds, analytics ingest), not competing with
 * HTTP request latency on the same process.
 *
 * `createApp()` still builds the Hono app and mounts every domain's routes (that's unavoidable
 * given today's domain-factory shape — see bootstrap.ts), but since nothing ever calls
 * `serve()`/`app.fetch` here, no port is bound and no HTTP traffic can reach it.
 */
initEventBus();
initCollabRedisRelay();
startRedisFanoutMonitor();

await createApp();

console.log(`Worker process started (pid ${process.pid}) — processing queues, no HTTP port bound`);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    console.log(`[worker] received ${signal} again, forcing exit`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`[worker] received ${signal}, draining jobs (15s timeout)`);

  const forceTimer = setTimeout(() => {
    console.log("[worker] drain timeout, forcing exit");
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  try {
    const { closeAllBullmqQueues } = await import("./shared/bullmq-queue");
    await closeAllBullmqQueues();
  } catch (err) {
    console.warn("[worker] queue drain failed", err);
  }

  clearTimeout(forceTimer);
  console.log("[worker] drain complete, exiting");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
