import { describe, expect, it } from "vitest";
import type { TenantDirectoryStore } from "./ports";
import { type TenantStatus, tenantDirectory } from "./schema";
import { createTenantDirectoryService } from "./service";

type Row = Parameters<TenantDirectoryStore["upsert"]>[0];

function store(rows: Row[] = []): TenantDirectoryStore {
  const byOrg = new Map(rows.map((row) => [row.orgId, row]));
  return {
    async list(filter) {
      return [...byOrg.values()]
        .filter((row) => (filter.status ? (row.status ?? "active") === filter.status : true))
        .filter((row) => (filter.excludePlatform ? !row.isPlatform : true))
        .map(toEntry);
    },
    async get(orgId) {
      const row = byOrg.get(orgId);
      return row ? toEntry(row) : null;
    },
    async upsert(input) {
      byOrg.set(input.orgId, input);
      return toEntry(input);
    },
    async backfill() {
      return 0;
    },
  };
}

function toEntry(row: Row) {
  const status = (row.status ?? "active") as TenantStatus;
  return {
    orgId: row.orgId,
    slug: row.slug,
    status,
    plan: row.plan ?? null,
    region: row.region ?? null,
    excludedReason: row.excludedReason ?? null,
    provisioningState: row.provisioningState ?? "ready",
    isPlatform: row.isPlatform ?? false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("tenant directory", () => {
  it("marks an org it has never seen as unknown, not eligible", async () => {
    const service = createTenantDirectoryService(store());
    await expect(service.selectability("org-typo")).resolves.toEqual({
      selectable: false,
      reason: "unknown_tenant",
    });
  });

  it("accepts an active tenant", async () => {
    const service = createTenantDirectoryService(
      store([{ orgId: "org-1", slug: "yogastore" }]),
    );
    await expect(service.selectability("org-1")).resolves.toEqual({ selectable: true });
  });

  it("refuses suspended and offboarding tenants", async () => {
    const service = createTenantDirectoryService(
      store([
        { orgId: "org-1", slug: "a", status: "suspended" },
        { orgId: "org-2", slug: "b", status: "offboarding" },
      ]),
    );
    await expect(service.selectability("org-1")).resolves.toMatchObject({
      reason: "tenant_suspended",
    });
    await expect(service.selectability("org-2")).resolves.toMatchObject({
      reason: "tenant_offboarding",
    });
  });

  it("refuses an excluded tenant even while active", async () => {
    const service = createTenantDirectoryService(
      store([{ orgId: "org-1", slug: "a", excludedReason: "legal_hold" }]),
    );
    await expect(service.selectability("org-1")).resolves.toMatchObject({
      reason: "tenant_excluded",
    });
  });

  it("refuses the platform org", async () => {
    const service = createTenantDirectoryService(
      store([{ orgId: "platform", slug: "noname-platform", isPlatform: true }]),
    );
    await expect(service.selectability("platform")).resolves.toMatchObject({
      reason: "platform_org",
    });
  });

  it("hides the platform org from the list and filters by status", async () => {
    const service = createTenantDirectoryService(
      store([
        { orgId: "platform", slug: "p", isPlatform: true },
        { orgId: "org-1", slug: "a" },
        { orgId: "org-2", slug: "b", status: "suspended" },
      ]),
    );
    const active = await service.list({ status: "active", excludePlatform: true });
    expect(active.map((entry) => entry.orgId)).toEqual(["org-1"]);
  });
});
