import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flagEvaluationRetentionMs,
  flagEvaluationSweepIntervalMs,
  resetFlagEvaluationRetentionForTests,
  setFlagEvaluationRetentionClock,
  sweepFlagEvaluations,
} from "./evaluation-retention";
import type { FlagStorage } from "./ports";

/**
 * S12: `flag_evaluations` is written on every flag evaluation — a per-request path — and had no
 * expiry, TTL or cleanup, so it grew without bound. These pin the retention sweep and, more
 * importantly, the gate: the sweep must not run per request, must not overlap itself, and must never
 * fail the evaluation that happened to trigger it.
 */

const originalRetention = process.env.FLAG_EVALUATION_RETENTION_DAYS;
const originalInterval = process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS;

afterEach(() => {
  resetFlagEvaluationRetentionForTests();
  if (originalRetention === undefined) delete process.env.FLAG_EVALUATION_RETENTION_DAYS;
  else process.env.FLAG_EVALUATION_RETENTION_DAYS = originalRetention;
  if (originalInterval === undefined) delete process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS;
  else process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS = originalInterval;
  vi.restoreAllMocks();
});

function storageWith(deleteImpl: (cutoff: Date) => Promise<number>) {
  const deleteEvaluationsOlderThan = vi.fn(deleteImpl);
  return {
    storage: { deleteEvaluationsOlderThan } as unknown as FlagStorage,
    deleteEvaluationsOlderThan,
  };
}

describe("flag evaluation retention", () => {
  it("deletes evaluations older than the retention window", async () => {
    const fixedNow = Date.UTC(2026, 9, 15, 12, 0, 0);
    setFlagEvaluationRetentionClock(() => fixedNow);
    process.env.FLAG_EVALUATION_RETENTION_DAYS = "30";
    const { storage, deleteEvaluationsOlderThan } = storageWith(async () => 7);

    const removed = await sweepFlagEvaluations(storage);

    expect(removed).toBe(7);
    expect(deleteEvaluationsOlderThan).toHaveBeenCalledTimes(1);
    const cutoff = deleteEvaluationsOlderThan.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(fixedNow - 30 * 86_400_000);
  });

  it("skips the sweep when the interval has not elapsed (the hot path must not pay per request)", async () => {
    let clock = Date.UTC(2026, 9, 15, 12, 0, 0);
    setFlagEvaluationRetentionClock(() => clock);
    const { storage, deleteEvaluationsOlderThan } = storageWith(async () => 1);

    await sweepFlagEvaluations(storage);
    // Simulate 100 evaluations shortly after: none of them may trigger another sweep.
    for (let i = 0; i < 100; i++) {
      clock += 100;
      expect(await sweepFlagEvaluations(storage)).toBeNull();
    }

    expect(deleteEvaluationsOlderThan).toHaveBeenCalledTimes(1);
  });

  it("sweeps again once the interval has elapsed", async () => {
    let clock = Date.UTC(2026, 9, 15, 12, 0, 0);
    setFlagEvaluationRetentionClock(() => clock);
    process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS = "60000";
    const { storage, deleteEvaluationsOlderThan } = storageWith(async () => 2);

    await sweepFlagEvaluations(storage);
    clock += 59_999;
    expect(await sweepFlagEvaluations(storage)).toBeNull();
    clock += 2;
    expect(await sweepFlagEvaluations(storage)).toBe(2);

    expect(deleteEvaluationsOlderThan).toHaveBeenCalledTimes(2);
  });

  it("does not overlap two sweeps that run concurrently", async () => {
    setFlagEvaluationRetentionClock(() => Date.now());
    let release: (() => void) | undefined;
    const { storage, deleteEvaluationsOlderThan } = storageWith(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(3);
        }),
    );

    const first = sweepFlagEvaluations(storage);
    // A second caller arriving while the first is in flight must not start another DELETE.
    expect(await sweepFlagEvaluations(storage)).toBeNull();

    release?.();
    expect(await first).toBe(3);
    expect(deleteEvaluationsOlderThan).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed sweep so it cannot fail the evaluation that triggered it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setFlagEvaluationRetentionClock(() => Date.now());
    const { storage } = storageWith(async () => {
      throw new Error("deadlock detected");
    });

    await expect(sweepFlagEvaluations(storage)).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalled();

    // And the gate still releases, so a later interval can retry rather than wedging forever.
    resetFlagEvaluationRetentionForTests();
    setFlagEvaluationRetentionClock(() => Date.now());
    const { storage: second, deleteEvaluationsOlderThan } = storageWith(async () => 5);
    await expect(sweepFlagEvaluations(second)).resolves.toBe(5);
    expect(deleteEvaluationsOlderThan).toHaveBeenCalledTimes(1);
  });

  it("reads retention and interval from the environment, ignoring nonsense values", () => {
    delete process.env.FLAG_EVALUATION_RETENTION_DAYS;
    expect(flagEvaluationRetentionMs()).toBe(30 * 86_400_000);
    process.env.FLAG_EVALUATION_RETENTION_DAYS = "7";
    expect(flagEvaluationRetentionMs()).toBe(7 * 86_400_000);
    process.env.FLAG_EVALUATION_RETENTION_DAYS = "nonsense";
    expect(flagEvaluationRetentionMs()).toBe(30 * 86_400_000);
    process.env.FLAG_EVALUATION_RETENTION_DAYS = "0";
    expect(flagEvaluationRetentionMs()).toBe(30 * 86_400_000);

    delete process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS;
    expect(flagEvaluationSweepIntervalMs()).toBe(60 * 60 * 1000);
    process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS = "5000";
    expect(flagEvaluationSweepIntervalMs()).toBe(5000);
  });
});
