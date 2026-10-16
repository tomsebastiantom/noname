import {
  createRetentionGate,
  positiveNumberEnv,
  retentionMsFromEnvDays,
} from "../../shared/retention";
import type { FlagStorage } from "./ports";

/**
 * Retention for `flag_evaluations` (S12).
 *
 * The table is written on every flag evaluation — a per-request path — and had no expiry, no TTL and
 * no cleanup, so it grew without bound. Rows are only read back by `listEvaluations`, which is a
 * debugging/analytics surface rather than something that needs full history.
 *
 * The gate (interval, non-overlap, never failing the caller) lives in `shared/retention.ts`, shared
 * with the other unbounded tables. `flag_evals_evaluated_at` indexes `evaluated_at` so the sweep's
 * `evaluated_at < cutoff` predicate is index-supported — the existing `flag_evals_flag_time` /
 * `flag_evals_subject_time` indexes lead with `flag_id` and `org_id` and cannot serve it.
 */

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** How long evaluations are kept. `FLAG_EVALUATION_RETENTION_DAYS`, default 30. */
export function flagEvaluationRetentionMs(): number {
  return retentionMsFromEnvDays("FLAG_EVALUATION_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
}

/** Minimum gap between sweeps in one process. `FLAG_EVALUATION_SWEEP_INTERVAL_MS`, default 1 hour. */
export function flagEvaluationSweepIntervalMs(): number {
  return positiveNumberEnv("FLAG_EVALUATION_SWEEP_INTERVAL_MS", DEFAULT_SWEEP_INTERVAL_MS);
}

const gate = createRetentionGate({
  name: "flag_evaluations",
  retentionMs: flagEvaluationRetentionMs,
  intervalMs: flagEvaluationSweepIntervalMs,
});

/** Test-only: forget the gate and restore the real clock. */
export function resetFlagEvaluationRetentionForTests(): void {
  gate.resetForTests();
}

/** Test-only: substitute the clock. */
export function setFlagEvaluationRetentionClock(clock: () => number): void {
  gate.setClockForTests(clock);
}

/**
 * Sweep if the interval has elapsed. Returns rows deleted, or `null` when skipped. Never throws.
 */
export async function sweepFlagEvaluations(storage: FlagStorage): Promise<number | null> {
  return gate.run((cutoff) => storage.deleteEvaluationsOlderThan(cutoff));
}
