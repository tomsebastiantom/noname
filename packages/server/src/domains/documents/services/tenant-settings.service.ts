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
let invalidationWired = false;

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
    if (typeof orgId === "string" && orgId) cache.delete(orgId);
  });
}

/** Test-only: drop cached settings and the invalidation wiring between test files. */
export function resetTenantSettingsCacheForTests(): void {
  cache.clear();
  invalidationWired = false;
}

export function createTenantSettingsService(storage: DocumentStorage): TenantSettingsService {
  wireInvalidation();

  return {
    async get(orgId) {
      const now = Date.now();
      const cached = readCache(orgId, now);
      if (cached) return cached;

      const existing = await storage.getTenantSettings(orgId);
      // No row is created here. Repeat reads are served from cache, and the first miss costs one
      // read instead of a read plus a write.
      const settings: TenantSettingsView = existing ?? {
        id: null,
        orgId,
        ...defaultTenantSettings(),
      };
      writeCache(orgId, settings, now);
      return settings;
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
      // Evict rather than pre-warm, and deliberately so: `eventBus.publish` below is delivered back
      // to this process's own subscriber, so anything written here is dropped again a moment later.
      // Pre-warming would therefore require awaiting the publish, which would stall this write for
      // up to the fan-out timeout whenever Redis is degraded. One extra read on a rare settings
      // write is the cheaper trade — and reads after it are cached again.
      cache.delete(orgId);
      void eventBus.publish(TenantSettingsEvents.UPDATED, { orgId });
      return saved;
    },
    resolveStoreSlug: (slug) => storage.findOrgIdByStoreSlug(normalizeStoreSlug(slug)),
    findOrgIdByOAuthConnectionId: (connectionId) =>
      storage.findOrgIdByOAuthConnectionId(connectionId),
  };
}
