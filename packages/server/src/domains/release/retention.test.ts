import { describe, expect, it } from "vitest";
import type {
  EnvironmentStore,
  PointerStore,
  ReleaseDTO,
  ReleaseEnvironmentDTO,
  ReleaseStore,
  TenantReleasePointerDTO,
} from "./ports";
import { createReleaseRetention } from "./retention";

function release(id: string, createdAt: Date): ReleaseDTO {
  return {
    id,
    orgId: "org-1",
    platformVersion: "v1",
    checksVersion: "c1",
    state: "ready",
    createdBy: "tom",
    createdAt,
    updatedAt: createdAt,
    artifacts: [],
  };
}

function fixtures() {
  const rows = new Map<string, ReleaseDTO>();
  const store: ReleaseStore = {
    async create() {
      throw new Error("unused");
    },
    async findById(_orgId, id) {
      return rows.get(id) ?? null;
    },
    async list(orgId) {
      return [...rows.values()].filter((entry) => entry.orgId === orgId);
    },
    async updateState() {
      throw new Error("unused");
    },
    async delete(orgId, ids) {
      const removed = ids.filter((id) => rows.get(id)?.orgId === orgId);
      for (const id of removed) rows.delete(id);
      return removed;
    },
  };

  const environments: EnvironmentStore = {
    async get() {
      return null;
    },
    async list() {
      return [];
    },
    async setActive() {
      throw new Error("unused");
    },
  };

  const pointers: PointerStore = {
    async get() {
      return null;
    },
    async set() {
      throw new Error("unused");
    },
  };

  return { rows, store, environments, pointers };
}

describe("release retention", () => {
  it("keeps the newest N and deletes the rest", async () => {
    const { rows, store, environments, pointers } = fixtures();
    const now = Date.now();
    for (let index = 0; index < 5; index++) {
      rows.set(`r_${index}`, release(`r_${index}`, new Date(now - index * 1000)));
    }
    const retention = createReleaseRetention(store, environments, pointers);

    const result = await retention.prune("org-1", 2);

    expect(result.deleted.sort()).toEqual(["r_2", "r_3", "r_4"]);
    expect(rows.has("r_0")).toBe(true);
    expect(rows.has("r_1")).toBe(true);
  });

  it("never deletes a release that is pointed at or active/previous", async () => {
    const { rows, store, environments, pointers } = fixtures();
    const now = Date.now();
    for (let index = 0; index < 5; index++) {
      rows.set(`r_${index}`, release(`r_${index}`, new Date(now - index * 1000)));
    }

    environments.list = async () => [
      {
        id: "env",
        orgId: "org-1",
        name: "production",
        activeReleaseId: "r_4",
        previousReleaseId: "r_3",
        updatedBy: "tom",
        updatedAt: new Date(),
      } satisfies ReleaseEnvironmentDTO,
    ];
    pointers.get = async () =>
      ({
        orgId: "org-1",
        releaseId: "r_2",
        previousReleaseId: null,
        updatedBy: "tom",
        updatedAt: new Date(),
      }) satisfies TenantReleasePointerDTO;

    const retention = createReleaseRetention(store, environments, pointers);
    const result = await retention.prune("org-1", 1);

    // r_1 is neither protected nor the newest release, so it is the only one removed.
    expect(result.deleted).toEqual(["r_1"]);
    for (const id of ["r_0", "r_2", "r_3", "r_4"]) expect(rows.has(id)).toBe(true);
  });

  it("is a no-op when there is nothing to delete", async () => {
    const { rows, store, environments, pointers } = fixtures();
    rows.set("r_0", release("r_0", new Date()));
    const retention = createReleaseRetention(store, environments, pointers);

    expect(await retention.prune("org-1", 3)).toEqual({ deleted: [] });
  });
});
