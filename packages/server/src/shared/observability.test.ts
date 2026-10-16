import { afterEach, describe, expect, it } from "vitest";
import { beginDraining, isDraining, resetLifecycleForTests } from "./lifecycle";
import { buildReadiness, type ObservabilityInput, renderMetrics } from "./observability";

/**
 * S16: `/health` is intentionally always-200 liveness, but there was no *readiness* signal an
 * orchestrator could act on and no scrape target for alerting. These pin what does and does not gate
 * readiness — the interesting part is the distinction, since gating on Redis or ClickHouse would
 * restart or de-route replicas that are still perfectly able to serve requests.
 */

function input(overrides: Partial<ObservabilityInput> = {}): ObservabilityInput {
  return {
    draining: false,
    databaseOk: true,
    redis: { degraded: false, subsystems: { "event-bus": true, sse: true } },
    analytics: { ready: true, attempts: 1, lastError: null },
    startedAt: 1_000_000,
    now: 1_060_000,
    ...overrides,
  };
}

afterEach(() => {
  resetLifecycleForTests();
});

describe("readiness", () => {
  it("is ready when the database is up and shutdown has not begun", () => {
    const payload = buildReadiness(input());
    expect(payload.ready).toBe(true);
    expect(payload.checks.database).toBe(true);
    expect(payload.checks.draining).toBe(false);
  });

  it("is unready when the database is unreachable", () => {
    expect(buildReadiness(input({ databaseOk: false })).ready).toBe(false);
  });

  it("is unready while draining, so a load balancer stops routing before the listener closes", () => {
    expect(buildReadiness(input({ draining: true })).ready).toBe(false);
  });

  it("stays ready when Redis fan-out is degraded (it does not stop this replica serving)", () => {
    const payload = buildReadiness(
      input({ redis: { degraded: true, subsystems: { "event-bus": false, sse: false } } }),
    );
    expect(payload.ready).toBe(true);
    // Still reported, so dashboards and alerting can see it.
    expect(payload.checks.redisDegraded).toBe(true);
  });

  it("stays ready when ClickHouse ingest is not ready", () => {
    const payload = buildReadiness(
      input({ analytics: { ready: false, attempts: 4, lastError: "ECONNREFUSED" } }),
    );
    expect(payload.ready).toBe(true);
    expect(payload.checks.analyticsReady).toBe(false);
  });

  it("tracks the draining flag through the lifecycle module", () => {
    expect(isDraining()).toBe(false);
    beginDraining();
    expect(isDraining()).toBe(true);
  });
});

describe("metrics", () => {
  it("exposes readiness, draining and uptime as gauges", () => {
    const body = renderMetrics(input());
    expect(body).toContain("noname_up 1");
    expect(body).toContain("noname_ready 1");
    expect(body).toContain("noname_draining 0");
    expect(body).toContain("noname_uptime_seconds 60");
    expect(body).toContain("# TYPE noname_ready gauge");
  });

  it("reports each Redis subsystem as a labelled gauge", () => {
    const body = renderMetrics(
      input({ redis: { degraded: true, subsystems: { "event-bus": true, sse: false } } }),
    );
    expect(body).toContain('noname_redis_fanout_subsystem_active{subsystem="event-bus"} 1');
    expect(body).toContain('noname_redis_fanout_subsystem_active{subsystem="sse"} 0');
    expect(body).toContain("noname_redis_fanout_degraded 1");
  });

  it("reports ClickHouse readiness and ensure attempts", () => {
    const body = renderMetrics(
      input({ analytics: { ready: false, attempts: 7, lastError: "timeout" } }),
    );
    expect(body).toContain("noname_clickhouse_ready 0");
    expect(body).toContain("noname_clickhouse_ensure_attempts 7");
  });

  it("emits HELP and TYPE once per family, not once per labelled sample", () => {
    // A strict Prometheus parser rejects a scrape with "second HELP line for metric name", so the
    // labelled family must carry its header once however many subsystems exist.
    const body = renderMetrics(
      input({
        redis: {
          degraded: false,
          subsystems: { "event-bus": true, sse: true, "collab-relay": true },
        },
      }),
    );
    const lines = body.split("\n");
    expect(
      lines.filter((line) => line.startsWith("# HELP noname_redis_fanout_subsystem_active")),
    ).toHaveLength(1);
    expect(
      lines.filter((line) => line.startsWith("# TYPE noname_redis_fanout_subsystem_active")),
    ).toHaveLength(1);
    // ...while still exposing one sample per subsystem.
    expect(
      lines.filter((line) => line.startsWith("noname_redis_fanout_subsystem_active{")),
    ).toHaveLength(3);
  });

  it("escapes label values so a subsystem name cannot break the exposition format", () => {
    const body = renderMetrics(
      input({ redis: { degraded: false, subsystems: { 'we"ird\\name': true } } }),
    );
    expect(body).toContain('subsystem="we\\"ird\\\\name"');
  });

  it("ends with a newline, as the Prometheus text format requires", () => {
    expect(renderMetrics(input()).endsWith("\n")).toBe(true);
  });
});
