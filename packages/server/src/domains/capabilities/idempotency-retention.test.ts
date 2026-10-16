import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapabilityIdempotencyStore } from "./idempotency";
import {
  capabilityIdempotencyGraceMs,
  capabilityIdempotencySweepIntervalMs,
  resetCapabilityIdempotencyRetentionForTests,
  setCapabilityIdempotencyRetentionClock,
  sweepCapabilityIdempotency,
} from "./idempotency-retention";

/**
 * S15: `capability_idempotency` gained a row per idempotent command and never lost one. `expires_at`
 * was already indexed, so the interesting part is the *grace*: an expired row is not inert, because
 * `claim` still returns `conflict` when the same key arrives with a different request hash. Deleting
 * at expiry would silently convert that conflict into a fresh claim.
 */

const originals = {
  grace: process.env.CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS,
  interval: process.env.CAPABILITY_IDEMPOTENCY_SWEEP_INTERVAL_MS,
};

afterEach(() => {
  resetCapabilityIdempotencyRetentionForTests();
  for (const [key, value] of [
    ["CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS", originals.grace],
    ["CAPABILITY_IDEMPOTENCY_SWEEP_INTERVAL_MS", originals.interval],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function storeWith(deleteImpl: (cutoff: Date) => Promise<number>) {
  const deleteExpiredBefore = vi.fn(deleteImpl);
  const store = { deleteExpiredBefore } as unknown as CapabilityIdempotencyStore;
  return { store, deleteExpiredBefore };
}

describe("capability idempotency retention", () => {
  it("deletes rows that expired longer ago than the grace period", async () => {
    const fixedNow = Date.UTC(2026, 9, 15, 12, 0, 0);
    setCapabilityIdempotencyRetentionClock(() => fixedNow);
    process.env.CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS = "7";
    const { store, deleteExpiredBefore } = storeWith(async () => 4);

    await expect(sweepCapabilityIdempotency(store)).resolves.toBe(4);

    const cutoff = deleteExpiredBefore.mock.calls[0]?.[0] as Date;
    // A row is removed only once it has been expired for a full week, not the moment it expires.
    expect(cutoff.getTime()).toBe(fixedNow - 7 * 86_400_000);
  });

  it("defaults to a seven-day grace rather than deleting at expiry", () => {
    delete process.env.CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS;
    expect(capabilityIdempotencyGraceMs()).toBe(7 * 86_400_000);
    // Strictly longer than the 24h idempotency window the store itself uses.
    expect(capabilityIdempotencyGraceMs()).toBeGreaterThan(24 * 3_600_000);
  });

  it("defaults the sweep interval to an hour", () => {
    delete process.env.CAPABILITY_IDEMPOTENCY_SWEEP_INTERVAL_MS;
    expect(capabilityIdempotencySweepIntervalMs()).toBe(3_600_000);
  });
});
