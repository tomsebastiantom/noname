/**
 * Readiness and metrics payloads (S16).
 *
 * The audit's finding was "no metrics, no readiness, `/health` always 200". `/health` returning 200
 * unconditionally is a deliberate *liveness* choice — a replica whose Redis fan-out has degraded is
 * still serving requests, and a liveness probe that restarts it makes the outage worse. What was
 * genuinely missing is the other half: a readiness signal an orchestrator can act on, and a scrape
 * target for alerting.
 *
 * So the two are separated here:
 *
 * - **Readiness** gates on hard dependencies only — the database this replica cannot serve without,
 *   and the draining flag. Redis fan-out and ClickHouse are reported for context but do **not** gate,
 *   for the same reason `/health` doesn't: both degrade a capability without making this replica
 *   unable to serve.
 * - **Metrics** are a pull-based snapshot of signals the process already tracks. There is deliberately
 *   no metrics SDK and no new instrumentation: that would be adding a subsystem, and the honest fix
 *   for "no scrape target" is to expose what already exists. Counters for things like post-commit hook
 *   failures would need instrumentation points and are still absent.
 *
 * Note both are unauthenticated, like `/health`. They are internal operational endpoints, and an
 * operator exposing the origin directly should front them (the edge does not route them).
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

/** Prometheus text exposition: escape backslash, quote and newline in label values. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
function renderLabels(labels?: Record<string, string>): string {
  if (!labels) return "";
  const pairs = Object.entries(labels).map(([key, value]) => `${key}="${escapeLabelValue(value)}"`);
  return `{${pairs.join(",")}}`;
}

export function renderMetrics(input: ObservabilityInput): string {
  const { ready } = buildReadiness(input);

  /**
   * Grouped by metric family so `HELP`/`TYPE` are emitted once per family, not once per sample.
   * Repeating them for each label set makes a strict Prometheus parser reject the whole scrape
   * ("second HELP line for metric name"), which is exactly what emitting them per subsystem did.
   */
  const families = new Map<string, { help: string; samples: string[] }>();
  const gauge = (name: string, help: string, value: number, labels?: Record<string, string>) => {
    const family = families.get(name) ?? { help, samples: [] };
    family.samples.push(`${name}${renderLabels(labels)} ${value}`);
    families.set(name, family);
  };

  gauge("noname_up", "1 while the process is serving.", 1);
  gauge(
    "noname_ready",
    "1 when hard dependencies are usable and shutdown has not begun.",
    ready ? 1 : 0,
  );
  gauge("noname_draining", "1 once shutdown has started.", input.draining ? 1 : 0);
  gauge(
    "noname_uptime_seconds",
    "Seconds since the process started.",
    (input.now - input.startedAt) / 1000,
  );
  gauge(
    "noname_redis_fanout_degraded",
    "1 when any Redis fan-out subsystem is degraded to single-instance mode.",
    input.redis.degraded ? 1 : 0,
  );
  for (const [subsystem, active] of Object.entries(input.redis.subsystems)) {
    gauge(
      "noname_redis_fanout_subsystem_active",
      "1 when this Redis fan-out subsystem's connections are ready.",
      active ? 1 : 0,
      { subsystem },
    );
  }
  gauge(
    "noname_clickhouse_ready",
    "1 when ClickHouse ingest is ready.",
    input.analytics.ready ? 1 : 0,
  );
  gauge(
    "noname_clickhouse_ensure_attempts",
    "Attempts made to ensure the ClickHouse table exists.",
    input.analytics.attempts,
  );

  const lines: string[] = [];
  for (const [name, family] of families) {
    lines.push(`# HELP ${name} ${family.help}`, `# TYPE ${name} gauge`, ...family.samples);
  }
  return `${lines.join("\n")}\n`;
}
