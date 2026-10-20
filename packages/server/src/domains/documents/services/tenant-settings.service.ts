import { createHash, randomBytes } from "node:crypto";
import { assertValidStoreSlug, normalizeStoreSlug } from "@noname/shared";
import { ValidationError } from "../../../shared/domain-error";
import { eventBus } from "../../../shared/event-bus";
import { TenantSettingsEvents } from "../events";
import type { DocumentStorage, TenantSettingsService, TenantSettingsView } from "../ports";
import { defaultTenantSettings } from "./tenant-defaults";

/** Publishable key (`pk_test_*` / `pk_live_*`) — public by design. */
export function generatePublishableKey(): string {
  const env = process.env.NODE_ENV === "production" ? "live" : "test";
  return `pk_${env}_${randomBytes(24).toString("base64url")}`;
}

/** Fingerprint for logs (never log the key itself). */
export function publishableKeyFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/**
 * Tenant settings are read on nearly every storefront request — directly (site resolution,
 * publishable-key checks, locale/SEO defaults) and indirectly all over `documents`, `auth`,
 * `integrations` and `notifications`. Every one of those reads hit Postgres, and a miss did not
 * merely read: it *wrote* a default row, so a read path performed an insert per request.
 *
 * Cache shape and why:
 * - **TTL as well as invalidation.** `upsert` evicts in-process and publishes
 *   `tenant_settings.updated`, which other replicas subscribe to below. The TTL is the backstop for
 *   when that publish is lost — Redis fan-out is best-effort (see `redis-fanout.ts`), so relying on
 *   invalidation alone would let a rotated `publishableKey` stay cached on a replica that never saw
 *   the event. It is short because `publishableKey` authenticates public actors, where staleness is a
 *   correctness issue rather than a cosmetic one.
 * - **Process-wide, not per service instance.** The service factory is called in tests and once per
 *   process in production; a per-instance cache would multiply entries and subscriptions.
 * - **`get()` returns defaults without storing them.** Nothing looks up the row that a read used to
 *   create: `findOrgIdByStoreSlug` needs a real `slug`, and the defaults have `slug: null`, so the
 *   row it wrote was unreachable through that lookup and existed only to be read back.
 */
const CACHE_TTL_MS = 30_000;

type CacheEntry = { settings: TenantSettingsView; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/**
 * Per-org fill fence, incremented by every invalidation.
 *
 * `get()` on a miss awaits a database read and then stores the result. An invalidation arriving inside
 * that await used to be undone: the read had already observed the old row, and the write-back put it
 * back, so the stale value survived the full 30s TTL despite the eviction that had just happened. The
 * fix is the standard one — capture the generation before the read and only store if it is unchanged,
 * discarding an in-flight fill that raced a write. It is the same fencing idea as Go's `singleflight`
 * plus a generation counter, Caffeine's refresh generation, and Facebook's cache leases.
 */
const generation = new Map<string, number>();

/** One in-flight load per org, so concurrent misses share a read instead of stampeding. */
const inFlight = new Map<string, Promise<TenantSettingsView>>();

let invalidationWired = false;

function currentGeneration(orgId: string): number {
  return generation.get(orgId) ?? 0;
}

/** Evict and fence: any fill that started before this call can no longer store its value. */
function invalidate(orgId: string): void {
  generation.set(orgId, currentGeneration(orgId) + 1);
  cache.delete(orgId);
}

function readCache(orgId: string, now: number): TenantSettingsView | null {
  const entry = cache.get(orgId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(orgId);
    return null;
  }
  return entry.settings;
}

function writeCache(orgId: string, settings: TenantSettingsView, now: number): void {
  cache.set(orgId, { settings, expiresAt: now + CACHE_TTL_MS });
}

/** Evict on other replicas. Registered once per process; the payload carries only an orgId. */
function wireInvalidation(): void {
  if (invalidationWired) return;
  invalidationWired = true;
  eventBus.subscribe(TenantSettingsEvents.UPDATED, async (payload) => {
    const orgId = (payload as { orgId?: unknown } | null)?.orgId;
    if (typeof orgId === "string" && orgId) invalidate(orgId);
  });
}

/** Test-only: drop cached settings, fences and in-flight loads between test files. */
export function resetTenantSettingsCacheForTests(): void {
  cache.clear();
  generation.clear();
  inFlight.clear();
  invalidationWired = false;
}

export function createTenantSettingsService(storage: DocumentStorage): TenantSettingsService {
  wireInvalidation();

  return {
    async get(orgId) {
      const now = Date.now();
      const cached = readCache(orgId, now);
      if (cached) return cached;

      // Single-flight: another request for this org is already loading, so share its result.
      const pending = inFlight.get(orgId);
      if (pending) return pending;

      const fillGeneration = currentGeneration(orgId);
      const load = (async () => {
        const existing = await storage.getTenantSettings(orgId);
        // No row is created here. Repeat reads are served from cache, and the first miss costs one
        // read instead of a read plus a write.
        const settings: TenantSettingsView = existing ?? {
          id: null,
          orgId,
          ...defaultTenantSettings(),
        };
        // Only store if no write invalidated this org while the read was in flight. The value is still
        // returned — it is what the database said — but caching it would re-stale a fresh eviction.
        if (currentGeneration(orgId) === fillGeneration) {
          writeCache(orgId, settings, Date.now());
        }
        return settings;
      })();

      inFlight.set(orgId, load);
      try {
        return await load;
      } finally {
        inFlight.delete(orgId);
      }
    },
    async upsert(orgId, data) {
      const nextSlug = data.slug == null ? null : normalizeStoreSlug(data.slug);
      if (nextSlug) {
        assertValidStoreSlug(nextSlug);
        const owner = await storage.findOrgIdByStoreSlug(nextSlug);
        if (owner && owner !== orgId) {
          throw new ValidationError(
            "tenant_settings",
            `Store slug "${nextSlug}" is already in use`,
          );
        }
      }
      const saved = await storage.upsertTenantSettings(orgId, { ...data, slug: nextSlug });
      // Evict and fence rather than pre-warm, and deliberately so: `eventBus.publish` below is
      // delivered back to this process's own subscriber, so anything written here is dropped again a
      // moment later. Pre-warming would therefore require awaiting the publish, which would stall this
      // write for up to the fan-out timeout whenever Redis is degraded. The fence is what makes
      // evicting safe: a read that started before this write can no longer store its stale result.
      invalidate(orgId);
      void eventBus.publish(TenantSettingsEvents.UPDATED, { orgId });
      return saved;
    },
    resolveStoreSlug: (slug) => storage.findOrgIdByStoreSlug(normalizeStoreSlug(slug)),
    findOrgIdByOAuthConnectionId: (connectionId) =>
      storage.findOrgIdByOAuthConnectionId(connectionId),
  };
}
