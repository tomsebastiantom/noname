import {
  createRetentionGate,
  positiveNumberEnv,
  retentionMsFromEnvDays,
} from "../../shared/retention";
import type { ProviderEventReceiptStore } from "./provider-event-receipts";

/**
 * Retention for `provider_event_receipts` (S15).
 *
 * One row per forwarded provider event, and nothing ever removed them — the table has no expiry
 * column at all, so a receipt was kept forever purely to answer "have I seen this event key before?".
 *
 * That is the trade this makes explicit: deleting a receipt also deletes the proof that its event was
 * handled, so an event the provider redelivers after the retention window is processed again. The
 * dedup window therefore shrinks from "forever" to the configured period. Providers redeliver within
 * hours or days, so 30 days sits far outside any retry they actually perform, and the alternative is
 * a table that grows with event volume without limit.
 *
 * `provider_event_receipts_created_at_idx` indexes `created_at`, because the table has no expiry
 * column and neither existing index can serve an age predicate.
 */

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** How long receipts are kept. `PROVIDER_EVENT_RECEIPT_RETENTION_DAYS`, default 30. */
export function providerEventReceiptRetentionMs(): number {
  return retentionMsFromEnvDays("PROVIDER_EVENT_RECEIPT_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
}

/** `PROVIDER_EVENT_RECEIPT_SWEEP_INTERVAL_MS`, default 1 hour. */
export function providerEventReceiptSweepIntervalMs(): number {
  return positiveNumberEnv("PROVIDER_EVENT_RECEIPT_SWEEP_INTERVAL_MS", DEFAULT_SWEEP_INTERVAL_MS);
}

const gate = createRetentionGate({
  name: "provider_event_receipts",
  retentionMs: providerEventReceiptRetentionMs,
  intervalMs: providerEventReceiptSweepIntervalMs,
});

/** Test-only: forget the gate and restore the real clock. */
export function resetProviderEventReceiptRetentionForTests(): void {
  gate.resetForTests();
}

/** Test-only: substitute the clock. */
export function setProviderEventReceiptRetentionClock(clock: () => number): void {
  gate.setClockForTests(clock);
}

/**
 * Sweep if the interval has elapsed. Returns rows deleted, or `null` when skipped. Never throws.
 */
export async function sweepProviderEventReceipts(
  store: ProviderEventReceiptStore,
): Promise<number | null> {
  return gate.run((cutoff) => store.deleteOlderThan(cutoff));
}
