import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRedisFanoutStatus,
  registerRedisFanout,
  resetRedisFanoutStatusForTests,
  startRedisFanoutMonitor,
} from "./redis-fanout-status";

describe("redis-fanout-status", () => {
  beforeEach(() => {
    resetRedisFanoutStatusForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetRedisFanoutStatusForTests();
    vi.useRealTimers();
  });

  it("reports healthy when every registered subsystem is active", () => {
    registerRedisFanout("event-bus", () => true);
    registerRedisFanout("sse", () => true);

    expect(getRedisFanoutStatus()).toEqual({
      degraded: false,
      subsystems: { "event-bus": true, sse: true },
    });
  });

  it("reports degraded when any registered subsystem is inactive", () => {
    registerRedisFanout("event-bus", () => true);
    registerRedisFanout("collab-relay", () => false);

    expect(getRedisFanoutStatus()).toEqual({
      degraded: true,
      subsystems: { "event-bus": true, "collab-relay": false },
    });
  });

  it("logs an error heartbeat on interval while degraded, and stops once healthy", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let active = false;
    registerRedisFanout("sse", () => active);
    startRedisFanoutMonitor();

    vi.advanceTimersByTime(5 * 60_000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("sse");

    active = true;
    vi.advanceTimersByTime(5 * 60_000);
    expect(errorSpy).toHaveBeenCalledTimes(1); // no additional log once healthy

    errorSpy.mockRestore();
  });
});
