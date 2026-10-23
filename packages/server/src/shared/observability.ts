/**
 * Readiness payloads (S16).
 *
 * The audit's finding was "no metrics, no readiness, `/health` always 200". `/health` returning 200
 * unconditionally is a deliberate *liveness* choice — a replica whose Redis fan-out has degraded is
 * still serving requests, and a liveness probe that restarts it makes the outage worse. What was
 * genuinely missing is the other half: a readiness signal an orchestrator can act on, and a scrape
 * target for alerting.
 *
 * Readiness gates on hard dependencies only — the database this replica cannot serve without, and the
 * draining flag. Redis fan-out and ClickHouse are reported for context but do **not** gate, for the same
 * reason `/health` doesn't: both degrade a capability without making this replica unable to serve.
 *
 * The scrape target now lives in `shared/metrics.ts` and is published through `prom-client`. An earlier
 * version rendered Prometheus text by hand here and shipped a scrape a strict parser rejects; the library
 * owns the format now, and this module keeps only the pure readiness decision, which is what `/ready`
 * returns and what the tests can pin without a registry.
 */

/** Structural, so `shared/` does not take a dependency on a domain module. */
export type FanoutSnapshot = { degraded: boolean; subsystems: Record<string, boolean> };
export type AnalyticsSnapshot = { ready: boolean; attempts: number; lastError: string | null };

export type ObservabilityInput = {
  /** Set while shutdown is draining; makes the replica unready so traffic stops arriving. */
  draining: boolean;
  databaseOk: boolean;
  redis: FanoutSnapshot;
  analytics: AnalyticsSnapshot;
  startedAt: number;
  now: number;
};

export type ReadinessPayload = {
  ready: boolean;
  checks: {
    /** Gates readiness. */
    database: boolean;
    /** Gates readiness. */
    draining: boolean;
    /** Reported only: degrades cross-replica sync, does not stop this replica serving. */
    redisDegraded: boolean;
    /** Reported only: degrades analytics ingest, does not stop this replica serving. */
    analyticsReady: boolean;
  };
};

export function buildReadiness(input: ObservabilityInput): ReadinessPayload {
  return {
    ready: input.databaseOk && !input.draining,
    checks: {
      database: input.databaseOk,
      draining: input.draining,
      redisDegraded: input.redis.degraded,
      analyticsReady: input.analytics.ready,
    },
  };
}
