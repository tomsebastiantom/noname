import client from "prom-client";
import { getClickHouseReadiness } from "../domains/analytics/adapters/clickhouse";
import { isDraining } from "./lifecycle";
import { getRedisFanoutStatus } from "./redis-fanout-status";

/**
 * Process metrics (S16).
 *
 * Everything is published through `prom-client` rather than a hand-written renderer: the exposition
 * format has sharp edges (label escaping, one `HELP`/`TYPE` per family, bucket layout) and an earlier
 * hand-rolled version of this file shipped a scrape that a strict Prometheus parser rejects. A library
 * that owns the format is the standard answer, and it makes the instrument types (counter, histogram,
 * gauge with a collect callback) declarative instead of string concatenation.
 *
 * What is instrumented, and why each one earns a place:
 * - HTTP duration/count by **route pattern** (not raw path — that would explode cardinality), so
 *   latency and error rate are answerable.
 * - The three failure sites that previously only logged: subscriber failures, post-commit hook failures,
 *   webhook delivery outcomes. "How often does this happen?" is the question logs cannot answer.
 * - Counters for work that has a quantity: retention rows deleted, relay republishes.
 * - Gauges for state that already existed (readiness, draining, Redis fan-out, ClickHouse) plus queue
 *   depth, which is normally the first signal you want when jobs back up.
 */

export const registry = new client.Registry();

/** Node process metrics (CPU, memory, event loop, GC) — conventional names, so leave them unprefixed. */
client.collectDefaultMetrics({ register: registry });

// ---------------------------------------------------------------- HTTP

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const httpRequestDuration = new client.Histogram({
  name: "noname_http_request_duration_seconds",
  help: "HTTP request duration in seconds, by method, route pattern and status.",
  labelNames: ["method", "route", "status"] as const,
  buckets: HTTP_BUCKETS,
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: "noname_http_requests_total",
  help: "HTTP requests by method, route pattern and status.",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

/** Records one completed request. `route` must be the matched pattern, never the raw URL. */
export function observeHttpRequest(input: {
  method: string;
  route: string;
  status: number;
  durationSeconds: number;
}): void {
  const labels = {
    method: input.method,
    route: input.route,
    status: String(input.status),
  };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, input.durationSeconds);
}

// ------------------------------------------------------- failure counters

/**
 * These three sites used to be invisible: a subscriber could throw on every event, a post-commit hook
 * could fail on every transition, and a webhook could fail every attempt, each leaving only a log line.
 */
export const eventBusSubscriberFailures = new client.Counter({
  name: "noname_event_bus_subscriber_failures_total",
  help: "Event-bus subscriber handlers that threw, by event name.",
  labelNames: ["event"] as const,
  registers: [registry],
});

export const postCommitHookFailures = new client.Counter({
  name: "noname_machine_post_commit_hook_failures_total",
  help: "Post-commit transition hooks that threw (the transition itself still committed).",
  labelNames: ["event"] as const,
  registers: [registry],
});

export const webhookDeliveryOutcomes = new client.Counter({
  name: "noname_webhook_delivery_outcomes_total",
  help: "Outbound webhook delivery attempts by event type and outcome.",
  labelNames: ["event_type", "outcome"] as const,
  registers: [registry],
});

// --------------------------------------------------------- work counters

export const retentionRowsDeleted = new client.Counter({
  name: "noname_retention_rows_deleted_total",
  help: "Rows removed by retention sweeps, by table.",
  labelNames: ["table"] as const,
  registers: [registry],
});

export const transitionRelayRepublished = new client.Counter({
  name: "noname_transition_relay_republished_total",
  help: "Committed transitions re-published by the relay because their event was never delivered.",
  registers: [registry],
});

// ---------------------------------------------------------------- gauges

/** Last database probe result, written by the `/ready` handler so the gauge reflects a real check. */
let lastDatabaseOk = false;

export function recordDatabaseProbe(ok: boolean): void {
  lastDatabaseOk = ok;
}

new client.Gauge({
  name: "noname_up",
  help: "1 while the process is serving.",
  registers: [registry],
  collect() {
    this.set(1);
  },
});

new client.Gauge({
  name: "noname_ready",
  help: "1 when hard dependencies are usable and shutdown has not begun.",
  registers: [registry],
  collect() {
    this.set(lastDatabaseOk && !isDraining() ? 1 : 0);
  },
});

new client.Gauge({
  name: "noname_draining",
  help: "1 once shutdown has started.",
  registers: [registry],
  collect() {
    this.set(isDraining() ? 1 : 0);
  },
});

new client.Gauge({
  name: "noname_uptime_seconds",
  help: "Seconds since the process started.",
  registers: [registry],
  collect() {
    this.set(process.uptime());
  },
});

new client.Gauge({
  name: "noname_redis_fanout_degraded",
  help: "1 when any Redis fan-out subsystem is degraded to single-instance mode.",
  registers: [registry],
  collect() {
    this.set(getRedisFanoutStatus().degraded ? 1 : 0);
  },
});

new client.Gauge({
  name: "noname_redis_fanout_subsystem_active",
  help: "1 when this Redis fan-out subsystem's connections are ready.",
  labelNames: ["subsystem"] as const,
  registers: [registry],
  collect() {
    const { subsystems } = getRedisFanoutStatus();
    for (const [subsystem, active] of Object.entries(subsystems)) {
      this.set({ subsystem }, active ? 1 : 0);
    }
  },
});

new client.Gauge({
  name: "noname_clickhouse_ready",
  help: "1 when ClickHouse ingest is ready.",
  registers: [registry],
  collect() {
    this.set(getClickHouseReadiness().ready ? 1 : 0);
  },
});

new client.Gauge({
  name: "noname_clickhouse_ensure_attempts",
  help: "Attempts made to ensure the ClickHouse table exists.",
  registers: [registry],
  collect() {
    this.set(getClickHouseReadiness().attempts);
  },
});

/**
 * Queue depth by queue and state. Supplied by the caller rather than imported here, so this module stays
 * free of a dependency on the BullMQ layer (and on Redis) — it is only data.
 */
type QueueDepthCollector = () => Promise<Record<string, Record<string, number>>>;
let queueDepthCollector: QueueDepthCollector | null = null;

export function setQueueDepthCollector(collector: QueueDepthCollector): void {
  queueDepthCollector = collector;
}

new client.Gauge({
  name: "noname_bullmq_queue_depth",
  help: "Jobs in a BullMQ queue by state.",
  labelNames: ["queue", "state"] as const,
  registers: [registry],
  async collect() {
    if (!queueDepthCollector) return;
    const depths = await queueDepthCollector();
    for (const [queue, states] of Object.entries(depths)) {
      for (const [state, count] of Object.entries(states)) {
        this.set({ queue, state }, count);
      }
    }
  },
});

// ---------------------------------------------------------------- render

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

/** Test-only: zero every instrument between test files (registrations are kept). */
export function resetMetricsForTests(): void {
  registry.resetMetrics();
  lastDatabaseOk = false;
}
