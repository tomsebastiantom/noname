import { retentionRowsDeleted } from "./metrics";

/**
 * Gated retention sweeps.
 *
 * Several tables grow because rows are written on request or job paths and nothing removes them once
 * they are logically dead: `flag_evaluations` (written per flag evaluation), `capability_idempotency`
 * (one row per command that supplies an idempotency key) and `provider_event_receipts` (one row per
 * forwarded provider event). Each has a different retention rule but the same operational problem, so
 * the gate lives here once rather than being reimplemented per table.
 *
 * Why a gate at all: the trigger sits on a write path, and running a DELETE per write would trade
 * unbounded table growth for unbounded write latency. A sweep is therefore skipped unless the
 * interval has elapsed, never overlaps itself, and can never fail the write that triggered it.
 *
 * The gate is per process, so each replica sweeps independently and a restart resets the timer. The
 * bound is "at most once per interval per process", which is sufficient for growth control; a
 * scheduled cross-replica job would be tidier and belongs with the enforcement work.
 */

/** Reads a positive number from the environment, falling back on anything unusable. */
export function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads a retention window in days from the environment. */
export function retentionMsFromEnvDays(name: string, fallbackDays: number): number {
  return positiveNumberEnv(name, fallbackDays) * 86_400_000;
}

export type RetentionGateOptions = {
  /** Appears in the failure log, e.g. `"flag_evaluations"`. */
  name: string;
  /** How far back to keep. Evaluated per run so configuration changes take effect. */
  retentionMs: () => number;
  /** Minimum gap between runs in this process. Evaluated per run. */
  intervalMs: () => number;
};

export interface RetentionGate {
  /**
   * Sweep if the interval has elapsed. The caller supplies the delete operation, so the gate holds no
   * reference to storage it only needs per call. Resolves rows removed, or `null` when skipped.
   */
  run(deleteBefore: (cutoff: Date) => Promise<number>): Promise<number | null>;
  /** Test-only: forget the gate and restore the real clock. */
  resetForTests(): void;
  /** Test-only: substitute the clock. */
  setClockForTests(clock: () => number): void;
}

export function createRetentionGate(options: RetentionGateOptions): RetentionGate {
  let now = () => Date.now();
  let lastRunStartedAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  return {
    async run(deleteBefore) {
      // A second caller arriving mid-sweep must not start another DELETE.
      if (inFlight) return null;

      const startedAt = now();
      if (lastRunStartedAt !== null && startedAt - lastRunStartedAt < options.intervalMs()) {
        return null;
      }
      // Claim the interval before awaiting, so concurrent writers do not all start a sweep.
      lastRunStartedAt = startedAt;

      let removed = 0;
      inFlight = (async () => {
        try {
          removed = await deleteBefore(new Date(startedAt - options.retentionMs()));
          if (removed > 0) retentionRowsDeleted.inc({ table: options.name }, removed);
        } catch (error) {
          // Never propagate: the caller is a write path whose own work already succeeded.
          console.error(
            `[retention] ${options.name} sweep failed; rows will be retried next interval`,
            error,
          );
        }
      })();

      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
      return removed;
    },

    resetForTests() {
      now = () => Date.now();
      lastRunStartedAt = null;
      inFlight = null;
    },

    setClockForTests(clock: () => number) {
      now = clock;
    },
  };
}
