import { describe, expect, it, vi } from "vitest";
import type { CreateProvisioningInput, ProvisioningRecord, ProvisioningStore } from "./ports";
import { createTenantProvisioningService } from "./service";

function memoryStore(): ProvisioningStore & { rows: Map<string, ProvisioningRecord> } {
  const rows = new Map<string, ProvisioningRecord>();
  return {
    rows,
    async create(input: CreateProvisioningInput) {
      const existing = rows.get(input.orgId);
      if (existing) return existing;
      const record: ProvisioningRecord = {
        orgId: input.orgId,
        idempotencyKey: input.idempotencyKey,
        state: "pending",
        steps: { directory: { status: "pending" } },
        requestedBy: input.requestedBy,
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      };
      rows.set(input.orgId, record);
      return record;
    },
    async get(orgId) {
      return rows.get(orgId) ?? null;
    },
    async findByIdempotencyKey(key) {
      return [...rows.values()].find((row) => row.idempotencyKey === key) ?? null;
    },
    async update(orgId, patch) {
      const current = rows.get(orgId);
      if (!current) throw new Error("missing");
      const next = { ...current, ...patch, updatedAt: new Date() } as ProvisioningRecord;
      rows.set(orgId, next);
      return next;
    },
  };
}

const input = {
  orgId: "org-new",
  slug: "acme",
  idempotencyKey: "acme:org-new",
  requestedBy: "provisioner-1",
};

describe("tenant provisioning", () => {
  it("is idempotent: the same tenant or key returns the existing record", async () => {
    const store = memoryStore();
    const directory = { upsert: vi.fn(async () => {}) };
    const service = createTenantProvisioningService(store, directory);

    const first = await service.start(input);
    const second = await service.start(input);

    expect(second.orgId).toBe(first.orgId);
    expect(store.rows.size).toBe(1);
  });

  it("runs the directory step first, then marks the tenant ready", async () => {
    const store = memoryStore();
    const calls: string[] = [];
    const directory = {
      upsert: vi.fn(async ({ provisioningState }: { provisioningState: string }) => {
        calls.push(provisioningState);
      }),
    };
    const service = createTenantProvisioningService(store, directory);

    await store.create(input);
    const done = await service.run("org-new");

    expect(calls).toEqual(["in_progress", "ready"]);
    expect(done.state).toBe("ready");
    expect(done.steps.directory?.status).toBe("done");
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it("records a failed step and leaves the tenant not-ready", async () => {
    const store = memoryStore();
    const directory = {
      upsert: vi.fn(async () => {
        throw new Error("slug already taken");
      }),
    };
    const service = createTenantProvisioningService(store, directory);

    await store.create(input);
    await expect(service.run("org-new")).rejects.toThrow("slug already taken");

    const row = await store.get("org-new");
    expect(row?.state).toBe("failed");
    expect(row?.lastError).toBe("slug already taken");
    expect(row?.steps.directory).toMatchObject({ status: "failed", error: "slug already taken" });
  });
});
