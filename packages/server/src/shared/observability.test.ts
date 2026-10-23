import { afterEach, describe, expect, it } from "vitest";
import { beginDraining, isDraining, resetLifecycleForTests } from "./lifecycle";
import { buildReadiness, type ObservabilityInput } from "./observability";

/**
 * S16: `/health` is intentionally always-200 liveness, but there was no *readiness* signal an
 * orchestrator could act on. These pin what does and does not gate readiness — the interesting part is
 * the distinction, since gating on Redis or ClickHouse would restart or de-route replicas that are still
 * perfectly able to serve requests.
 *
 * The scrape target moved to `shared/metrics.ts` (prom-client); what remains here is the pure decision
 * that `/ready` returns.
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
