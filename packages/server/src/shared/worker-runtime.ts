function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

/**
 * Global gate for whether this process should start BullMQ workers at all.
 *
 * Every domain's background worker is started as a side effect of building that domain (see
 * each `domains/*\/index.ts`), which is also where that domain's HTTP routes come from — so an
 * API replica has always transitively started every worker too, and HTTP request-handling and
 * job-processing have always shared one process's event loop and one process's slice of the
 * fixed DB connection pool.
 *
 * Set `RUN_WORKERS=false` on API replicas (paired with a separate replica set running
 * `worker.ts`, which never sets this and so keeps the default of `true`) to let the two scale
 * independently instead. Defaults to `true` so a single-process deployment (e.g. local dev,
 * `docker compose up`) keeps working exactly as before with no configuration.
 */
export function workersEnabled(): boolean {
  return envFlag("RUN_WORKERS", true);
}

/**
 * Per-queue concurrency override (e.g. `AGENT_WORKER_CONCURRENCY=8`), falling back to the
 * hardcoded default already tuned for that queue. Lets ops tune concurrency per worker replica
 * without a code change or redeploy of unrelated queues.
 */
export function workerConcurrency(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
