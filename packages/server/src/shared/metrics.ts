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

// ---------------------------------------------------------------- eval
//
// One run produces one decision; per-check detail is counted here rather than written to the audit kernel.
// The audit row is the decision (see docs/2026-11-07/RFC-RELEASE-GATE.md §8), not every check.

export const evalRunsTotal = new client.Counter({
  name: "noname_eval_runs_total",
  help: "Eval gate decisions by outcome.",
  labelNames: ["decision"] as const,
  registers: [registry],
});

export const evalChecksTotal = new client.Counter({
  name: "noname_eval_checks_total",
  help: "Eval check results by check id, status and level.",
  labelNames: ["check", "status", "level"] as const,
  registers: [registry],
});

export const evalUnverifiedTotal = new client.Counter({
  name: "noname_eval_unverified_total",
  help: "Eval runs that completed with required checks unverified.",
  registers: [registry],
});

export const evalFlakyTotal = new client.Counter({
  name: "noname_eval_flaky_total",
  help: "Eval checks that failed once and passed on retry.",
  registers: [registry],
});

export const evalResultsReusedTotal = new client.Counter({
  name: "noname_eval_results_reused_total",
  help: "Eval results served from the content-addressed cache.",
  registers: [registry],
});

export const evalResultsComputedTotal = new client.Counter({
  name: "noname_eval_results_computed_total",
  help: "Eval results actually recomputed.",
  registers: [registry],
});

export const evalGateReuseTotal = new client.Counter({
  name: "noname_eval_gate_reuse_total",
  help: "Gate runs that reused a result. Must stay 0: a gate never reuses.",
  registers: [registry],
});

/** Report reuse/computed counts from the CLI or worker (the server does not run checks itself). */
export function recordEvalReuse(input: { reused: number; computed: number; gate?: boolean }): void {
  if (input.reused > 0) evalResultsReusedTotal.inc(input.reused);
  if (input.computed > 0) evalResultsComputedTotal.inc(input.computed);
  if (input.gate && input.reused > 0) evalGateReuseTotal.inc();
}

export function recordEvalResult(result: {
  passed: boolean;
  counts: { unverified: number; flaky?: number };
  checks: Array<{ id: string; status: string; level: string }>;
}): void {
  evalRunsTotal.inc({ decision: result.passed ? "pass" : "blocked" });
  for (const check of result.checks) {
    evalChecksTotal.inc({ check: check.id, status: check.status, level: check.level });
  }
  if (result.counts.unverified > 0) evalUnverifiedTotal.inc();
  if ((result.counts.flaky ?? 0) > 0) evalFlakyTotal.inc(result.counts.flaky ?? 0);
}

// ---------------------------------------------------------------- agent identity

const agentUserInfoCacheTotal = new client.Counter({
  name: "noname_agent_userinfo_cache_total",
  help: "Agent userinfo role lookups by cache result (hit, miss, error).",
  labelNames: ["result"] as const,
  registers: [registry],
});

const agentUserInfoDuration = new client.Histogram({
  name: "noname_agent_userinfo_duration_seconds",
  help: "Agent userinfo role lookup duration, by cache result.",
  labelNames: ["result"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

const agentTokenRateLimitedTotal = new client.Counter({
  name: "noname_agent_token_rate_limited_total",
  help: "Agent token mint requests rejected by the per-agent rate limit.",
  registers: [registry],
});

const agentKeyRotationsTotal = new client.Counter({
  name: "noname_agent_key_rotations_total",
  help: "ZITADEL service-account keys rotated for registered agents.",
  registers: [registry],
});

export function recordAgentUserInfo(
  result: "hit" | "miss" | "error",
  seconds: number,
): void {
  agentUserInfoCacheTotal.inc({ result });
  agentUserInfoDuration.observe({ result }, seconds);
}

const agentTokenRejectionsTotal = new client.Counter({
  name: "noname_agent_token_rejections_total",
  help: "Agent token rejections by reason (unregistered, no_grant, expired, subject_mismatch, agent_mismatch, no_permissions).",
  labelNames: ["reason"] as const,
  registers: [registry],
});

export function recordAgentTokenRejection(reason: string): void {
  agentTokenRejectionsTotal.inc({ reason });
}

export function recordAgentTokenRateLimited(): void {
  agentTokenRateLimitedTotal.inc();
}

export function recordAgentKeyRotation(): void {
  agentKeyRotationsTotal.inc();
}

// ---------------------------------------------------------------- render

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

/** Test-only: zero every instrument between test files (registrations are kept). */
export function resetMetricsForTests(): void {
  registry.resetMetrics();
  lastDatabaseOk = false;
}
