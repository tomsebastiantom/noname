import { eventBus } from "../../shared/event-bus";
import { transitionRelayRepublished } from "../../shared/metrics";
import { MachineEvents } from "./events";
import type { MachineStorage } from "./ports";

/**
 * Re-publishes committed transitions whose event never went out.
 *
 * This is the "relay" half of the transactional outbox, but without an outbox table: `commitTransition`
 * has always written the transition row **inside the same transaction** as the state change, so the
 * durable record of "this happened" already exists and already commits atomically. What was missing was
 * any way to tell which rows had been delivered — so an event lost between `COMMIT` and
 * `eventBus.publish` was lost forever.
 *
 * The design mirrors Spring Modulith's event publication registry: an entry persisted with the business
 * transaction, marked when dispatch succeeds, and resent when it did not. Here the entry is the
 * transition row itself and the marker is `published_at`, which is cheaper than a parallel table and
 * cannot drift from the state it describes.
 *
 * Guarantees, stated precisely:
 * - **At-least-once.** A crash between publish and `markTransitionPublished` re-publishes; it never
 *   drops. Consumers must therefore be idempotent — the webhook path already is, keyed by
 *   `(subscription_id, event_id)` with an occurrence-unique `event_id`.
 * - **Duplicate dispatch across processes is possible.** Every worker-enabled replica runs a relay and
 *   the read is not exclusive, so two processes can publish the same row. Harmless for idempotent
 *   consumers and wasteful otherwise; making it exclusive needs an advisory lock on a pinned session or
 *   a claim-and-staleness protocol. Neither is warranted while duplicates are harmless.
 * - **Ordering is best-effort.** Rows are published oldest-first within a pass, but the live publish
 *   path runs concurrently, so an event can overtake one still waiting for the relay.
 * - **Bounded latency either way.** The normal path publishes inline; the relay only picks up rows
 *   older than `settleMs`, so it does not race a publish that is merely in flight.
 */

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_SETTLE_MS = 30_000;
const DEFAULT_BATCH = 100;

function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How often the relay looks for undelivered transitions. `MACHINE_TRANSITION_RELAY_INTERVAL_MS`. */
export function transitionRelayIntervalMs(): number {
  return positiveEnv("MACHINE_TRANSITION_RELAY_INTERVAL_MS", DEFAULT_INTERVAL_MS);
}

/**
 * How long a transition must have been committed before the relay will touch it.
 * `MACHINE_TRANSITION_RELAY_SETTLE_MS`. This is the guard against racing the inline publish: without
 * it the relay would regularly re-publish events that were published microseconds earlier.
 */
export function transitionRelaySettleMs(): number {
  return positiveEnv("MACHINE_TRANSITION_RELAY_SETTLE_MS", DEFAULT_SETTLE_MS);
}

export function transitionRelayBatchSize(): number {
  return positiveEnv("MACHINE_TRANSITION_RELAY_BATCH", DEFAULT_BATCH);
}

export type TransitionRelay = {
  /** Run one pass. Returns how many transitions were republished. Exposed for tests and for one-shot use. */
  runOnce(now?: Date): Promise<number>;
  start(): void;
  stop(): Promise<void>;
};

export function createTransitionRelay(
  storage: MachineStorage,
  options: { intervalMs?: number; settleMs?: number; batchSize?: number } = {},
): TransitionRelay {
  const intervalMs = options.intervalMs ?? transitionRelayIntervalMs();
  const settleMs = options.settleMs ?? transitionRelaySettleMs();
  const batchSize = options.batchSize ?? transitionRelayBatchSize();

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<number> | null = null;

  async function runOnce(now = new Date()): Promise<number> {
    const olderThan = new Date(now.getTime() - settleMs);
    const pending = await storage.listUnpublishedTransitions(batchSize, olderThan);
    let published = 0;

    for (const transition of pending) {
      // A row with no orgId cannot be routed; it predates the column. Publishing it would deliver an
      // event no subscriber can attribute to a tenant, so mark it and move on rather than looping on it
      // forever.
      if (!transition.orgId) {
        if (transition.revision !== null) {
          await storage.markTransitionPublished(transition.instanceId, transition.revision);
        }
        continue;
      }

      // Awaited on purpose: this loop exists for durability, so it must observe whether the publish
      // succeeded. Marking after a failed publish would silently lose the event — the exact bug the
      // relay is here to prevent.
      await eventBus.publish(MachineEvents.TRANSITION, {
        orgId: transition.orgId,
        instanceId: transition.instanceId,
        event: transition.event,
        fromState: transition.fromState,
        toState: transition.toState,
        params: transition.params,
        revision: transition.revision ?? undefined,
      });

      // Only mark after a successful publish. A throw above leaves the row unpublished and it is
      // retried on the next pass — the whole point of the marker.
      if (transition.revision !== null) {
        await storage.markTransitionPublished(transition.instanceId, transition.revision);
      }
      published += 1;
    }

    if (published > 0) {
      transitionRelayRepublished.inc(published);
      console.info(`[machines] relay republished ${published} undelivered transition(s)`);
    }
    return published;
  }

  return {
    runOnce,

    start() {
      if (timer) return;
      timer = setInterval(() => {
        // Never overlap passes: a slow database would otherwise queue them up.
        if (inFlight) return;
        inFlight = runOnce()
          .catch((error: unknown) => {
            console.error("[machines] transition relay pass failed", error);
            return 0;
          })
          .finally(() => {
            inFlight = null;
          });
      }, intervalMs);
      // Don't hold the process open just for the relay.
      timer.unref?.();
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      // Let an in-flight pass finish so a shutdown does not abandon a half-marked batch.
      await inFlight?.catch(() => undefined);
      inFlight = null;
    },
  };
}
