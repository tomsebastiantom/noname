/**
 * Registry of the in-process BullMQ workers, so shutdown can drain them.
 *
 * Every domain starts its own worker as a side effect of construction (see each
 * `domains/*\/index.ts`), which is why `RUN_WORKERS=true` — the default — makes an API process host
 * several workers alongside HTTP. Shutdown closed the *queue* objects and nothing else, so the
 * workers' in-flight jobs were abandoned mid-execution on every deploy: a webhook delivery, an email
 * send, a catalog build or an agent run could be killed after it had already started side effects.
 *
 * `worker.close()` is what drains: it stops pulling new jobs and resolves once the job currently in
 * progress has finished. `force` is deliberately not passed — forcing would reproduce the behaviour
 * this exists to fix. If a job never finishes, the entrypoints' existing forced-exit timer still
 * bounds shutdown.
 *
 * Registration happens inside each `start*Worker` rather than at the wiring sites, because the
 * domain objects expose those workers under inconsistent names (`worker`, `outboundWorker`,
 * `deliveryWorker`, …). A registry that a constructor joins cannot be forgotten by wiring.
 */

/**
 * What the registry needs from a worker. Deliberately structural rather than `Worker<T>`: BullMQ's
 * `Worker` is invariant in its job-data type, so `Worker<EmailOutboundJobData>` is *not* assignable
 * to `Worker<unknown>` and a registry typed that way would reject every real worker. Draining only
 * needs `close()`, so that is all this asks for.
 */
export type ClosableWorker = { close(): Promise<void> };

const workers = new Set<ClosableWorker>();

export function registerBullmqWorker(worker: ClosableWorker): void {
  workers.add(worker);
}

/** Number of registered workers. Test-only introspection. */
export function registeredBullmqWorkerCount(): number {
  return workers.size;
}

/**
 * Stop every registered worker and wait for in-flight jobs. Never throws: a failure to close one
 * worker must not strand the others, and shutdown has to reach `process.exit` either way.
 */
export async function closeAllBullmqWorkers(): Promise<void> {
  const closing = [...workers];
  workers.clear();
  if (closing.length === 0) return;

  const results = await Promise.allSettled(closing.map((worker) => worker.close()));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[shutdown] ${failed}/${closing.length} worker(s) failed to close cleanly`);
  }
}

/** Test-only: drop registrations between test files. */
export function resetBullmqWorkersForTests(): void {
  workers.clear();
}
