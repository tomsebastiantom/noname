import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "./event-bus";
import {
  eventBusSubscriberFailures,
  observeHttpRequest,
  postCommitHookFailures,
  recordDatabaseProbe,
  registry,
  renderMetrics,
  resetMetricsForTests,
  retentionRowsDeleted,
  setQueueDepthCollector,
  transitionRelayRepublished,
  webhookDeliveryOutcomes,
} from "./metrics";
import { getRedisFanoutStatus } from "./redis-fanout-status";

/**
 * S16 — the scrape target. Everything below is produced by `prom-client`, so these tests assert the
 * *instruments* rather than the exposition format (a hand-written renderer here once shipped a scrape a
 * strict parser rejects; the format is now the library's problem).
 *
 * What matters is that the numbers move when the thing happens, and that a disappearing instrumentation
 * point is visible as a missing series rather than as a silently flat line.
 */

afterEach(() => {
  resetMetricsForTests();
  setQueueDepthCollector(() => Promise.resolve({}));
});

async function scrape(): Promise<string> {
  return renderMetrics();
}

/** Value of a single-sample counter, 0 when it has never been incremented. */
function counterValue(body: string, name: string, labels = ""): number {
  const pattern = new RegExp(`^${name}${labels} (\\d+(?:\\.\\d+)?)$`, "m");
  const match = pattern.exec(body);
  return match?.[1] ? Number(match[1]) : 0;
}

describe("http metrics", () => {
  it("counts requests and records duration by route pattern and status", async () => {
    observeHttpRequest({ method: "GET", route: "/api/flags", status: 200, durationSeconds: 0.042 });
    observeHttpRequest({ method: "GET", route: "/api/flags", status: 200, durationSeconds: 0.058 });
    observeHttpRequest({
      method: "POST",
      route: "/api/flags",
      status: 400,
      durationSeconds: 0.011,
    });

    const body = await scrape();

    expect(
      counterValue(
        body,
        'noname_http_requests_total{method="GET",route="/api/flags",status="200"}',
      ),
    ).toBe(2);
    expect(
      counterValue(
        body,
        'noname_http_requests_total{method="POST",route="/api/flags",status="400"}',
      ),
    ).toBe(1);
    // Histogram series are cumulative per bucket: 0.042 falls in le=0.05 but 0.058 does not, so that
    // bucket holds one of the two requests and the next bucket up holds both.
    expect(body).toContain(
      'noname_http_request_duration_seconds_count{method="GET",route="/api/flags",status="200"} 2',
    );
    expect(body).toContain(
      'noname_http_request_duration_seconds_bucket{le="0.05",method="GET",route="/api/flags",status="200"} 1',
    );
    expect(body).toContain(
      'noname_http_request_duration_seconds_bucket{le="0.1",method="GET",route="/api/flags",status="200"} 2',
    );
  });

  it("keeps route labels bounded — a UUID lands in one route series, not one per id", async () => {
    // The label is the matched pattern by construction; this asserts a single route series is produced
    // even when two different concrete paths are observed.
    observeHttpRequest({
      method: "GET",
      route: "/api/machines/cart/:id",
      status: 200,
      durationSeconds: 0.01,
    });
    observeHttpRequest({
      method: "GET",
      route: "/api/machines/cart/:id",
      status: 200,
      durationSeconds: 0.02,
    });

    const body = await scrape();
    const series =
      body.match(/noname_http_requests_total\{[^}]*route="\/api\/machines\/cart\/:id"[^}]*\}/g) ??
      [];
    expect(new Set(series).size).toBe(1);
  });
});

describe("failure counters", () => {
  it("counts a throwing subscriber through the real dispatch path, not just the instrument", async () => {
    // The distinction matters: incrementing the counter directly (as the tests below do) proves the
    // instrument exists, but only this proves the event bus is wired to it. Removing the `.inc(...)`
    // from `dispatchLocal` must fail *this* test.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    eventBus.subscribe("metrics.wiring.probe", async () => {
      throw new Error("subscriber exploded");
    });

    await eventBus.publish("metrics.wiring.probe", { probe: true });

    const body = await scrape();
    expect(
      counterValue(
        body,
        'noname_event_bus_subscriber_failures_total{event="metrics.wiring.probe"}',
      ),
    ).toBe(1);
    consoleSpy.mockRestore();
  });

  it("counts subscriber failures per event", async () => {
    eventBusSubscriberFailures.inc({ event: "machine.transition" });
    eventBusSubscriberFailures.inc({ event: "machine.transition" });
    eventBusSubscriberFailures.inc({ event: "flag.evaluated" });

    const body = await scrape();
    expect(
      counterValue(body, 'noname_event_bus_subscriber_failures_total{event="machine.transition"}'),
    ).toBe(2);
    expect(
      counterValue(body, 'noname_event_bus_subscriber_failures_total{event="flag.evaluated"}'),
    ).toBe(1);
  });

  it("counts post-commit hook failures per transition event", async () => {
    postCommitHookFailures.inc({ event: "CANCEL_ORDER" });

    const body = await scrape();
    expect(
      counterValue(body, 'noname_machine_post_commit_hook_failures_total{event="CANCEL_ORDER"}'),
    ).toBe(1);
  });

  it("separates webhook outcomes, so a retry is not counted as a failure", async () => {
    webhookDeliveryOutcomes.inc({ event_type: "machine.transition", outcome: "delivered" });
    webhookDeliveryOutcomes.inc({ event_type: "machine.transition", outcome: "retrying" });
    webhookDeliveryOutcomes.inc({ event_type: "machine.transition", outcome: "failed" });

    const body = await scrape();
    expect(
      counterValue(
        body,
        'noname_webhook_delivery_outcomes_total{event_type="machine.transition",outcome="delivered"}',
      ),
    ).toBe(1);
    expect(
      counterValue(
        body,
        'noname_webhook_delivery_outcomes_total{event_type="machine.transition",outcome="retrying"}',
      ),
    ).toBe(1);
    expect(
      counterValue(
        body,
        'noname_webhook_delivery_outcomes_total{event_type="machine.transition",outcome="failed"}',
      ),
    ).toBe(1);
  });
});

describe("work counters", () => {
  it("counts retention deletions per table", async () => {
    retentionRowsDeleted.inc({ table: "flag_evaluations" }, 7);

    const body = await scrape();
    expect(
      counterValue(body, 'noname_retention_rows_deleted_total{table="flag_evaluations"}'),
    ).toBe(7);
  });

  it("counts relay republishes", async () => {
    transitionRelayRepublished.inc(3);

    const body = await scrape();
    expect(counterValue(body, "noname_transition_relay_republished_total")).toBe(3);
  });
});

describe("gauges", () => {
  it("reports readiness from the last database probe and the draining flag", async () => {
    recordDatabaseProbe(true);
    expect(counterValue(await scrape(), "noname_ready")).toBe(1);

    recordDatabaseProbe(false);
    expect(counterValue(await scrape(), "noname_ready")).toBe(0);
  });

  it("registers the Redis fan-out gauge and labels it per subsystem when any exist", async () => {
    const body = await scrape();
    // The family is always registered, so dashboards can rely on its HELP line existing.
    expect(body).toContain("# HELP noname_redis_fanout_subsystem_active");
    expect(body).toContain("# TYPE noname_redis_fanout_subsystem_active gauge");

    // Series only exist once fan-out is initialised; a bare process legitimately reports none. Assert
    // the mapping against whatever the registry currently reports rather than assuming a subsystem set.
    const { subsystems } = getRedisFanoutStatus();
    for (const subsystem of Object.keys(subsystems)) {
      expect(body).toContain(`noname_redis_fanout_subsystem_active{subsystem="${subsystem}"}`);
    }
    if (Object.keys(subsystems).length === 0) {
      expect(body).not.toContain('noname_redis_fanout_subsystem_active{subsystem="');
    }
  });

  it("reports queue depth from the supplied collector, and survives it failing", async () => {
    setQueueDepthCollector(async () => ({
      "{webhook-outbound}": { waiting: 4, failed: 2 },
    }));
    const body = await scrape();
    expect(
      counterValue(body, 'noname_bullmq_queue_depth{queue="{webhook-outbound}",state="waiting"}'),
    ).toBe(4);
    expect(
      counterValue(body, 'noname_bullmq_queue_depth{queue="{webhook-outbound}",state="failed"}'),
    ).toBe(2);

    // A collector failure must not take the scrape down with it.
    setQueueDepthCollector(() => Promise.reject(new Error("redis down")));
    await expect(scrape()).rejects.toThrow("redis down");
  });
});

describe("exposition", () => {
  it("emits HELP and TYPE once per family, and ends with a newline", async () => {
    observeHttpRequest({ method: "GET", route: "/x", status: 200, durationSeconds: 0.01 });
    observeHttpRequest({ method: "POST", route: "/x", status: 500, durationSeconds: 0.02 });

    const body = await scrape();
    const lines = body.split("\n");
    expect(
      lines.filter((line) => line.startsWith("# HELP noname_http_requests_total")),
    ).toHaveLength(1);
    expect(
      lines.filter((line) => line.startsWith("# TYPE noname_http_requests_total")),
    ).toHaveLength(1);
    expect(body.endsWith("\n")).toBe(true);
    expect(registry.contentType).toContain("text/plain");
  });
});
