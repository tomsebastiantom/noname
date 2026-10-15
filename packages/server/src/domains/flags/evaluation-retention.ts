import type { FlagStorage } from "./ports";

/**
 * Retention for `flag_evaluations` (S12).
 *
 * The table is written on every flag evaluation — a per-request path — and had no expiry, no TTL and
 * no cleanup, so it grew without bound. Rows are only ever read back by `listEvaluations`, which is a
 * debugging/analytics surface rather than something that needs full history.
 *
 * The sweep is deliberately **not** run inline on every evaluation. That path is the hot one, and a
 * DELETEs worth of work per request would trade unbounded growth for unbounded latency. Instead the
 * trigger is time-gated per process: at most one sweep per interval, skipped entirely while a previous
 * sweep is still in flight, and never allowed to fail the evaluation that happened to trigger it.
 *
 * `flag_evals_evaluated_at` indexes `evaluated_at` so the sweep's `evaluated_at < cutoff` predicate is
 * index-supported. The existing `flag_evals_flag_time` / `flag_evals_subject_time` indexes lead with
 * `flag_id` and `org_id` and cannot serve it.
 *
 * An in-process gate means each replica sweeps independently and a restart resets the timer, so the
 * bound is "at most once per interval per process" rather than globally. That is sufficient for
 * bounding growth; a scheduled cross-replica job would be the tidier form and belongs with the
 * enforcement/CI work rather than here.
 */

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Test seam: lets a test drive the clock without waiting an hour. */
let now = () => Date.now();
let lastSweepStartedAt: number | null = null;
let sweepInFlight: Promise<void> | null = null;

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How long evaluations are kept. `FLAG_EVALUATION_RETENTION_DAYS`, default 30. */
export function flagEvaluationRetentionMs(): number {
  return (
    positiveNumber(process.env.FLAG_EVALUATION_RETENTION_DAYS, DEFAULT_RETENTION_DAYS) * 86_400_000
  );
}

/** Minimum gap between sweeps in one process. `FLAG_EVALUATION_SWEEP_INTERVAL_MS`, default 1 hour. */
export function flagEvaluationSweepIntervalMs(): number {
  return positiveNumber(process.env.FLAG_EVALUATION_SWEEP_INTERVAL_MS, DEFAULT_SWEEP_INTERVAL_MS);
}

/** Test-only: forget the gate and restore the real clock. */
export function resetFlagEvaluationRetentionForTests(): void {
  now = () => Date.now();
  lastSweepStartedAt = null;
  sweepInFlight = null;
}

/** Test-only: substitute the clock. */
export function setFlagEvaluationRetentionClock(clock: () => number): void {
  now = clock;
}

/**
 * Sweep if the interval has elapsed. Returns the number of rows deleted, or `null` when the sweep was
 * skipped (too soon, or one already running). Never throws: a failed sweep must not fail an evaluation.
 */
export async function sweepFlagEvaluations(storage: FlagStorage): Promise<number | null> {
  if (sweepInFlight) return null;
  const startedAt = now();
  if (
    lastSweepStartedAt !== null &&
    startedAt - lastSweepStartedAt < flagEvaluationSweepIntervalMs()
  ) {
    return null;
  }
  // Claim the interval before awaiting, so concurrent evaluations do not all start a sweep.
  lastSweepStartedAt = startedAt;

  let removed = 0;
  sweepInFlight = (async () => {
    try {
      removed = await storage.deleteEvaluationsOlderThan(
        new Date(startedAt - flagEvaluationRetentionMs()),
      );
    } catch (error) {
      console.error(
        "[flags] flag_evaluations retention sweep failed; rows will be retried next interval",
        error,
      );
    }
  })();

  try {
    await sweepInFlight;
  } finally {
    sweepInFlight = null;
  }
  return removed;
}
