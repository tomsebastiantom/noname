import {
  createRetentionGate,
  positiveNumberEnv,
  retentionMsFromEnvDays,
} from "../../shared/retention";
import type { CapabilityIdempotencyStore } from "./idempotency";

/**
 * Retention for `capability_idempotency` (S15).
 *
 * One row per command that supplies an idempotency key, and nothing ever removed them:
 * `expires_at` existed and was indexed, and the claim path already treats an expired row as
 * reclaimable, but the row itself stayed forever. So the table grew with command volume and only ever
 * shrank when someone ran SQL by hand.
 *
 * **Why a grace period rather than deleting at expiry.** An expired row is not inert: `claim` reads
 * the existing row and returns `conflict` when the same key arrives with a *different* request hash,
 * before it considers expiry. Deleting the moment `expires_at` passed would turn that conflict into a
 * fresh claim. The extra window keeps the key's binding behaviour intact well past the idempotency
 * window (24h by default), so only keys nobody could still be retrying are removed.
 */

const DEFAULT_GRACE_DAYS = 7;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long past expiry a row is kept before deletion.
 * `CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS`, default 7.
 */
export function capabilityIdempotencyGraceMs(): number {
  return retentionMsFromEnvDays("CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS", DEFAULT_GRACE_DAYS);
}

/** `CAPABILITY_IDEMPOTENCY_SWEEP_INTERVAL_MS`, default 1 hour. */
export function capabilityIdempotencySweepIntervalMs(): number {
  return positiveNumberEnv("CAPABILITY_IDEMPOTENCY_SWEEP_INTERVAL_MS", DEFAULT_SWEEP_INTERVAL_MS);
}

const gate = createRetentionGate({
  name: "capability_idempotency",
  retentionMs: capabilityIdempotencyGraceMs,
  intervalMs: capabilityIdempotencySweepIntervalMs,
});

/** Test-only: forget the gate and restore the real clock. */
export function resetCapabilityIdempotencyRetentionForTests(): void {
  gate.resetForTests();
}

/** Test-only: substitute the clock. */
export function setCapabilityIdempotencyRetentionClock(clock: () => number): void {
  gate.setClockForTests(clock);
}

/**
 * Sweep if the interval has elapsed. Returns rows deleted, or `null` when skipped. Never throws.
 */
export async function sweepCapabilityIdempotency(
  store: CapabilityIdempotencyStore,
): Promise<number | null> {
  return gate.run((cutoff) => store.deleteExpiredBefore(cutoff));
}
