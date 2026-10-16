import { afterEach, describe, expect, it, vi } from "vitest";
import { createRetentionGate, positiveNumberEnv, retentionMsFromEnvDays } from "./retention";

/**
 * The gate shared by every retention sweep (S12/S15). Its semantics were previously tested only
 * through the `flag_evaluations` wrapper, which meant adding a second and third sweep would have
 * duplicated the tests rather than the behaviour. These pin the properties that make a sweep safe to
 * trigger from a write path.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function gate(retentionMs = 1_000, intervalMs = 60_000) {
  return createRetentionGate({
    name: "test-table",
    retentionMs: () => retentionMs,
    intervalMs: () => intervalMs,
  });
}

describe("retention gate", () => {
  it("passes a cutoff of now minus the retention window", async () => {
    const sweep = gate(1_000);
    sweep.setClockForTests(() => 10_000);
    const deleteBefore = vi.fn(async () => 3);

    await expect(sweep.run(deleteBefore)).resolves.toBe(3);

    const cutoff = deleteBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(9_000);
  });

  it("skips every run inside the interval, so a write path does not pay per write", async () => {
    let clock = 1_000_000;
    const sweep = gate(1_000, 60_000);
    sweep.setClockForTests(() => clock);
    const deleteBefore = vi.fn(async () => 1);

    await sweep.run(deleteBefore);
    for (let i = 0; i < 100; i++) {
      clock += 100;
      expect(await sweep.run(deleteBefore)).toBeNull();
    }

    expect(deleteBefore).toHaveBeenCalledTimes(1);
  });

  it("runs again once the interval has elapsed", async () => {
    let clock = 1_000_000;
    const sweep = gate(1_000, 60_000);
    sweep.setClockForTests(() => clock);
    const deleteBefore = vi.fn(async () => 2);

    await sweep.run(deleteBefore);
    clock += 59_999;
    expect(await sweep.run(deleteBefore)).toBeNull();
    clock += 2;
    expect(await sweep.run(deleteBefore)).toBe(2);
    expect(deleteBefore).toHaveBeenCalledTimes(2);
  });

  it("does not overlap two concurrent sweeps", async () => {
    const sweep = gate();
    let release: (() => void) | undefined;
    const deleteBefore = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(5);
        }),
    );

    const first = sweep.run(deleteBefore);
    expect(await sweep.run(deleteBefore)).toBeNull();
    release?.();
    expect(await first).toBe(5);
    expect(deleteBefore).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed sweep so it cannot fail the write that triggered it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sweep = gate();
    const deleteBefore = vi.fn(async () => {
      throw new Error("deadlock detected");
    });

    await expect(sweep.run(deleteBefore)).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("test-table");
  });

  it("releases the gate after a failure, so the next interval can retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let clock = 1_000_000;
    const sweep = gate(1_000, 60_000);
    sweep.setClockForTests(() => clock);

    await expect(
      sweep.run(async () => {
        throw new Error("transient");
      }),
    ).resolves.toBe(0);

    clock += 60_001;
    await expect(sweep.run(async () => 4)).resolves.toBe(4);
  });
});

describe("retention env helpers", () => {
  const original = process.env.RETENTION_TEST_VALUE;
  const originalDays = process.env.RETENTION_TEST_DAYS;

  afterEach(() => {
    if (original === undefined) delete process.env.RETENTION_TEST_VALUE;
    else process.env.RETENTION_TEST_VALUE = original;
    if (originalDays === undefined) delete process.env.RETENTION_TEST_DAYS;
    else process.env.RETENTION_TEST_DAYS = originalDays;
  });

  it("reads a positive number and ignores nonsense", () => {
    delete process.env.RETENTION_TEST_VALUE;
    expect(positiveNumberEnv("RETENTION_TEST_VALUE", 42)).toBe(42);
    process.env.RETENTION_TEST_VALUE = "7";
    expect(positiveNumberEnv("RETENTION_TEST_VALUE", 42)).toBe(7);
    process.env.RETENTION_TEST_VALUE = "nonsense";
    expect(positiveNumberEnv("RETENTION_TEST_VALUE", 42)).toBe(42);
    process.env.RETENTION_TEST_VALUE = "0";
    expect(positiveNumberEnv("RETENTION_TEST_VALUE", 42)).toBe(42);
    process.env.RETENTION_TEST_VALUE = "-3";
    expect(positiveNumberEnv("RETENTION_TEST_VALUE", 42)).toBe(42);
  });

  it("converts a day count to milliseconds", () => {
    delete process.env.RETENTION_TEST_DAYS;
    expect(retentionMsFromEnvDays("RETENTION_TEST_DAYS", 30)).toBe(30 * 86_400_000);
    process.env.RETENTION_TEST_DAYS = "2";
    expect(retentionMsFromEnvDays("RETENTION_TEST_DAYS", 30)).toBe(2 * 86_400_000);
  });
});
