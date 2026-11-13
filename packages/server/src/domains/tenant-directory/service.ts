import type {
  TenantDirectoryService,
  TenantDirectoryStore,
  TenantSelectability,
} from "./ports";

/**
 * The directory answers one question for the release control plane: **may this org be selected?**
 *
 * It is deliberately fail-closed. An org with no directory row is `unknown_tenant`, not "probably fine" —
 * that is what stops a typo from becoming an orphan release pointer.
 */
export function createTenantDirectoryService(store: TenantDirectoryStore): TenantDirectoryService {
  return {
    list: (filter) => store.list(filter),
    get: (orgId) => store.get(orgId),
    upsert: (input) => store.upsert(input),
    backfill: () => store.backfill(),

    async selectability(orgId): Promise<TenantSelectability> {
      const entry = await store.get(orgId);
      if (!entry) return { selectable: false, reason: "unknown_tenant" };
      if (entry.isPlatform) return { selectable: false, reason: "platform_org" };
      if (entry.status === "suspended") return { selectable: false, reason: "tenant_suspended" };
      if (entry.status === "offboarding") return { selectable: false, reason: "tenant_offboarding" };
      if (entry.excludedReason) return { selectable: false, reason: "tenant_excluded" };
      return { selectable: true };
    },
  };
}
