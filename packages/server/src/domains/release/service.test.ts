import { describe, expect, it } from "vitest";
import {
  ConflictError,
  NotFoundError,
  StorageError,
  ValidationError,
} from "../../shared/domain-error";
import type { CreateReleaseInput, ReleaseDTO, ReleaseState, ReleaseStore } from "./ports";
import { createReleaseService } from "./service";

function memoryStore() {
  const rows = new Map<string, ReleaseDTO>();
  let seq = 0;

  const store: ReleaseStore & { rows: Map<string, ReleaseDTO> } = {
    rows,
    async create(orgId, input: CreateReleaseInput, createdBy) {
      const now = new Date();
      const id = `r_${++seq}`;
      const release: ReleaseDTO = {
        id,
        orgId,
        platformVersion: input.platformVersion,
        checksVersion: input.checksVersion,
        state: "building",
        createdBy,
        createdAt: now,
        updatedAt: now,
        artifacts: input.artifacts.map((artifact, index) => ({
          ...artifact,
          id: `a_${seq}_${index}`,
          releaseId: id,
          createdAt: now,
        })),
      };
      rows.set(id, release);
      return release;
    },
    async findById(orgId, id) {
      const release = rows.get(id);
      return release && release.orgId === orgId ? release : null;
    },
    async findByIdAnyOrg(id) {
      return rows.get(id) ?? null;
    },
    async list(orgId) {
      return [...rows.values()].filter((release) => release.orgId === orgId);
    },
    async updateState(orgId, id, state: ReleaseState) {
      const release = await store.findById(orgId, id);
      if (!release) throw new StorageError(`missing release ${id}`);
      const updated = { ...release, state, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async delete(orgId, ids) {
      const removed = ids.filter((id) => rows.get(id)?.orgId === orgId);
      for (const id of removed) rows.delete(id);
      return removed;
    },
  };

  return store;
}

const validInput: CreateReleaseInput = {
  platformVersion: "v12",
  checksVersion: "9f2a1c",
  artifacts: [
    {
      kind: "client_bundle",
      ref: "tenants/org/releases/r_1/remoteEntry.js",
      digest: "sha256:3f3f3f3f",
    },
    { kind: "server_image", ref: "registry/api:r17", digest: "sha256:9c9c9c9c" },
    { kind: "migration_set", ref: "0042-0043", digest: "sha256:0a0a0a0a" },
  ],
};

describe("release service", () => {
  it("creates a building release with digest-bound artifacts", async () => {
    const store = memoryStore();
    const service = createReleaseService(store);

    const release = await service.create("org-1", validInput, "tom");

    expect(release).toMatchObject({
      orgId: "org-1",
      platformVersion: "v12",
      checksVersion: "9f2a1c",
      state: "building",
      createdBy: "tom",
    });
    expect(release.artifacts.map((artifact) => artifact.kind)).toEqual([
      "client_bundle",
      "server_image",
      "migration_set",
    ]);
  });

  it("rejects an empty artifact set", async () => {
    const service = createReleaseService(memoryStore());
    await expect(
      service.create("org-1", { ...validInput, artifacts: [] }, "tom"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects duplicate artifact kinds", async () => {
    const service = createReleaseService(memoryStore());
    await expect(
      service.create(
        "org-1",
        {
          ...validInput,
          artifacts: [
            { kind: "server_image", ref: "a", digest: "sha256:aaaaaaaa" },
            { kind: "server_image", ref: "b", digest: "sha256:bbbbbbbb" },
          ],
        },
        "tom",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an artifact without a digest", async () => {
    const service = createReleaseService(memoryStore());
    await expect(
      service.create(
        "org-1",
        { ...validInput, artifacts: [{ kind: "client_bundle", ref: "x", digest: "" }] },
        "tom",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("moves building → ready once, then conflicts", async () => {
    const service = createReleaseService(memoryStore());
    const release = await service.create("org-1", validInput, "tom");

    const ready = await service.markReady("org-1", release.id);
    expect(ready.state).toBe("ready");

    await expect(service.markReady("org-1", release.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not resolve a release across orgs", async () => {
    const service = createReleaseService(memoryStore());
    const release = await service.create("org-1", validInput, "tom");

    await expect(service.get("org-2", release.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the caller's org", async () => {
    const service = createReleaseService(memoryStore());
    await service.create("org-1", validInput, "tom");
    await service.create("org-2", validInput, "tom");

    expect(await service.list("org-1")).toHaveLength(1);
  });
});
