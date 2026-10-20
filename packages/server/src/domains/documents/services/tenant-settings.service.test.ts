import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../../shared/event-bus";
import { TenantSettingsEvents } from "../events";
import type { DocumentStorage, TenantSettingsDTO, TenantSettingsUpsert } from "../ports";
import { DEFAULT_TENANT_AUTH } from "../tenant/auth-config";
import {
  createTenantSettingsService,
  resetTenantSettingsCacheForTests,
} from "./tenant-settings.service";

/**
 * S10, first half: tenant settings are read on nearly every storefront request, and the old
 * `get()` did two wrong things on each one — it queried Postgres every time, and on a miss it
 * *wrote* a default row, turning a read path into an insert path. These pin the cache and the
 * no-write-on-read rule, plus the invalidation that keeps a rotated publishable key from being
 * served from a stale entry.
 */

const ORG = "org-1";

function storedSettings(overrides: Partial<TenantSettingsDTO> = {}): TenantSettingsDTO {
  return {
    id: "ts-1",
    orgId: ORG,
    slug: "yogastore",
    locales: ["en-US"],
    defaultLocale: "en-US",
    seo: {},
    integrations: {},
    auth: { ...DEFAULT_TENANT_AUTH },
    publishableKey: "pk_test_original",
    ...overrides,
  };
}

function makeStorage(initial: TenantSettingsDTO | null) {
  let current = initial;
  const getTenantSettings = vi.fn(async () => current);
  const upsertTenantSettings = vi.fn(async (orgId: string, data: TenantSettingsUpsert) => {
    current = { id: "ts-1", orgId, ...data, publishableKey: data.publishableKey ?? null };
    return current;
  });
  const storage = {
    getTenantSettings,
    upsertTenantSettings,
    findOrgIdByStoreSlug: vi.fn(async () => null),
  } as unknown as DocumentStorage;
  return { storage, getTenantSettings, upsertTenantSettings };
}

beforeEach(() => {
  resetTenantSettingsCacheForTests();
});

afterEach(() => {
  resetTenantSettingsCacheForTests();
  vi.useRealTimers();
});

describe("tenant settings caching", () => {
  it("reads storage once and serves repeat reads from cache", async () => {
    const { storage, getTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    const first = await service.get(ORG);
    const second = await service.get(ORG);
    const third = await service.get(ORG);

    expect(getTenantSettings).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third.publishableKey).toBe("pk_test_original");
  });

  it("returns defaults without writing a row when nothing is stored", async () => {
    const { storage, getTenantSettings, upsertTenantSettings } = makeStorage(null);
    const service = createTenantSettingsService(storage);

    const settings = await service.get(ORG);

    // The defect: a read used to insert a default row, so a miss cost a write.
    expect(upsertTenantSettings).not.toHaveBeenCalled();
    expect(getTenantSettings).toHaveBeenCalledTimes(1);
    expect(settings.id).toBeNull();
    expect(settings.orgId).toBe(ORG);
    expect(settings.slug).toBeNull();
    expect(settings.publishableKey).toBeNull();
    expect(settings.defaultLocale).toBe("en-US");
  });

  it("caches a miss too, so a tenant without settings is not re-queried per request", async () => {
    const { storage, getTenantSettings } = makeStorage(null);
    const service = createTenantSettingsService(storage);

    await service.get(ORG);
    await service.get(ORG);

    expect(getTenantSettings).toHaveBeenCalledTimes(1);
  });

  it("re-reads once the TTL expires, so invalidation is a backstop and not the only path", async () => {
    vi.useFakeTimers();
    const { storage, getTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    await service.get(ORG);
    expect(getTenantSettings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_001);
    await service.get(ORG);

    expect(getTenantSettings).toHaveBeenCalledTimes(2);
  });

  it("keeps a distinct entry per org", async () => {
    const { storage, getTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    await service.get(ORG);
    await service.get("org-2");

    expect(getTenantSettings).toHaveBeenCalledTimes(2);
  });

  it("serves the newly written value after upsert", async () => {
    const { storage, getTenantSettings, upsertTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    await service.upsert(ORG, {
      slug: "new-slug",
      locales: ["en-US"],
      defaultLocale: "en-US",
      seo: {},
      integrations: {},
      auth: { ...DEFAULT_TENANT_AUTH },
      publishableKey: "pk_test_rotated",
    });
    const settings = await service.get(ORG);

    expect(upsertTenantSettings).toHaveBeenCalledTimes(1);
    // A rotated key must never be masked by the entry cached before it. Re-reading once here is
    // expected: the writer evicts instead of pre-warming, because its own UPDATED event is
    // delivered back to this process and would drop a pre-warmed entry anyway.
    expect(getTenantSettings).toHaveBeenCalledTimes(1);
    expect(settings.publishableKey).toBe("pk_test_rotated");
    expect(settings.slug).toBe("new-slug");
  });

  it("drops its entry when another replica announces an update", async () => {
    const { storage, getTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    await service.get(ORG);
    expect(getTenantSettings).toHaveBeenCalledTimes(1);

    // Simulates the cross-replica path: the writer publishes, every replica evicts.
    await eventBus.publish(TenantSettingsEvents.UPDATED, { orgId: ORG });
    await service.get(ORG);

    expect(getTenantSettings).toHaveBeenCalledTimes(2);
  });

  it("ignores an update announcement for a different org", async () => {
    const { storage, getTenantSettings } = makeStorage(storedSettings());
    const service = createTenantSettingsService(storage);

    await service.get(ORG);
    await eventBus.publish(TenantSettingsEvents.UPDATED, { orgId: "org-other" });
    await service.get(ORG);

    expect(getTenantSettings).toHaveBeenCalledTimes(1);
  });

  it("still refuses a slug another org already owns", async () => {
    const { storage } = makeStorage(storedSettings());
    (storage.findOrgIdByStoreSlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "org-other",
    );
    const service = createTenantSettingsService(storage);

    await expect(
      service.upsert(ORG, {
        slug: "yogastore",
        locales: ["en-US"],
        defaultLocale: "en-US",
        seo: {},
        integrations: {},
        auth: { ...DEFAULT_TENANT_AUTH },
      }),
    ).rejects.toThrow(/already in use/);
  });
});

/**
 * S14, the remaining instance: the invalidate-then-refill race.
 *
 * `get()` on a miss awaits a database read and then stores the result. An invalidation arriving inside
 * that await used to be undone — the read had already observed the old row, and the write-back put it
 * back — so a rotated `publishableKey` survived the eviction for the full 30s TTL.
 *
 * The fix is the standard pair: single-flight coalescing (as in Go's `singleflight`: "only one
 * execution is in-flight for a given key") plus a per-org generation fence that discards a fill which
 * raced a write (the "stale set" protection Facebook's memcache leases introduced).
 */
describe("tenant settings cache races", () => {
  it("does not cache a read that an update invalidated while it was in flight", async () => {
    let current = storedSettings({ slug: "stale", publishableKey: "pk_test_stale" });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstCall = true;

    const getTenantSettings = vi.fn(async () => {
      // Snapshot at call time — this is the race: the read observed the old row at T0 and resolves
      // after the write at T1.
      const observed = current;
      if (firstCall) {
        firstCall = false;
        await gate;
      }
      return observed;
    });
    const upsertTenantSettings = vi.fn(async (orgId: string, data: TenantSettingsUpsert) => {
      current = { id: "ts-1", orgId, ...data, publishableKey: data.publishableKey ?? null };
      return current;
    });
    const storage = {
      getTenantSettings,
      upsertTenantSettings,
      findOrgIdByStoreSlug: vi.fn(async () => null),
    } as unknown as DocumentStorage;
    const service = createTenantSettingsService(storage);

    // T0: a storefront read starts and observes the old row.
    const inFlightRead = service.get(ORG);

    // T1: an admin write lands and invalidates while that read is still open.
    await service.upsert(ORG, {
      slug: "fresh-slug",
      locales: ["en-US"],
      defaultLocale: "en-US",
      seo: {},
      integrations: {},
      auth: { ...DEFAULT_TENANT_AUTH },
      publishableKey: "pk_test_fresh",
    });

    // Let this process's own invalidation echo finish before the stale read resolves. `upsert` fires
    // `void eventBus.publish(...)`, so without settling it the echo's delete lands *after* the stale
    // write-back and hides the bug — the first version of this test passed with the fence removed for
    // exactly that reason.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // T2: the open read finally resolves with what it observed at T0.
    release?.();
    const raced = await inFlightRead;
    expect(raced.slug).toBe("stale");

    // T3: the next read must see the new row — the fenced fill must not have re-cached "stale".
    const after = await service.get(ORG);
    expect(after.slug).toBe("fresh-slug");
    expect(after.publishableKey).toBe("pk_test_fresh");
    // Two reads: the fenced one declined to store, so this had to go back to the database.
    expect(getTenantSettings).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent misses into one database read", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getTenantSettings = vi.fn(async () => {
      await gate;
      return storedSettings({ slug: "yogastore" });
    });
    const storage = {
      getTenantSettings,
      upsertTenantSettings: vi.fn(),
      findOrgIdByStoreSlug: vi.fn(async () => null),
    } as unknown as DocumentStorage;
    const service = createTenantSettingsService(storage);

    // Ten concurrent storefront requests for a cold org.
    const reads = Array.from({ length: 10 }, () => service.get(ORG));
    release?.();
    const results = await Promise.all(reads);

    expect(getTenantSettings).toHaveBeenCalledTimes(1);
    for (const result of results) expect(result.slug).toBe("yogastore");
  });
});
