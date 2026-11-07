import { describe, expect, it } from "vitest";
import { ConflictError } from "../../shared/domain-error";
import type { EvidenceRecordInput, EvidenceService } from "../evidence/ports";
import { createReleasePointerService } from "./pointer-service";
import type {
  PointerStore,
  ReleaseDTO,
  ReleaseService,
  ReleaseState,
  TenantReleasePointerDTO,
} from "./ports";

function release(id: string, state: ReleaseState, withBundle = true): ReleaseDTO {
  const now = new Date();
  return {
    id,
    orgId: "org-1",
    platformVersion: "v1",
    checksVersion: "c1",
    state,
    createdBy: "tom",
    createdAt: now,
    updatedAt: now,
    artifacts: withBundle
      ? [
          {
            id: `a-${id}`,
            releaseId: id,
            kind: "client_bundle",
            ref: `tenants/org-1/releases/${id}/remoteEntry.js`,
            digest: `sha256:${id}`,
            createdAt: now,
          },
        ]
      : [],
  };
}

function fixtures(releasesById: Map<string, ReleaseDTO>) {
  const rows = new Map<string, TenantReleasePointerDTO>();
  const store: PointerStore = {
    async get(orgId) {
      return rows.get(orgId) ?? null;
    },
    async set(orgId, releaseId, previousReleaseId, updatedBy) {
      const row: TenantReleasePointerDTO = {
        orgId,
        releaseId,
        previousReleaseId,
        updatedBy,
        updatedAt: new Date(),
      };
      rows.set(orgId, row);
      return row;
    },
  };

  const releases = {
    async get(_orgId, id) {
      const found = releasesById.get(id);
      if (!found) throw new Error(`unknown release ${id}`);
      return found;
    },
  } as unknown as ReleaseService;

  const recorded: EvidenceRecordInput[] = [];
  const evidence = {
    async appendRecord(input: EvidenceRecordInput) {
      recorded.push(input);
      return { ...input, id: `ev-${recorded.length}`, recordedAt: new Date() };
    },
  } as unknown as EvidenceService;

  return { store, releases, evidence, recorded };
}

describe("tenant release pointer", () => {
  it("promotes a ready release and records one move", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([["r_1", release("r_1", "ready")]]),
    );
    const pointer = createReleasePointerService(store, releases, evidence);

    const row = await pointer.promote("org-1", "r_1", "tom");

    expect(row).toMatchObject({ releaseId: "r_1", previousReleaseId: null, updatedBy: "tom" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: "platform.release.tenant_promoted",
      subjectId: "org-1",
      data: { from: null, to: "r_1", rollback: false },
    });
  });

  it("refuses a release that is not ready", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([["r_1", release("r_1", "building")]]),
    );
    const pointer = createReleasePointerService(store, releases, evidence);

    await expect(pointer.promote("org-1", "r_1", "tom")).rejects.toBeInstanceOf(ConflictError);
    expect(recorded).toHaveLength(0);
    expect(await store.get("org-1")).toBeNull();
  });

  it("is a no-op when the release is already pointed at", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([["r_1", release("r_1", "ready")]]),
    );
    const pointer = createReleasePointerService(store, releases, evidence);

    await pointer.promote("org-1", "r_1", "tom");
    const again = await pointer.promote("org-1", "r_1", "tom");

    expect(again.releaseId).toBe("r_1");
    expect(recorded).toHaveLength(1);
  });

  it("keeps the old release as previous and rolls back", async () => {
    const { store, releases, evidence } = fixtures(
      new Map([
        ["r_1", release("r_1", "ready")],
        ["r_2", release("r_2", "ready")],
      ]),
    );
    const pointer = createReleasePointerService(store, releases, evidence);

    await pointer.promote("org-1", "r_1", "tom");
    const second = await pointer.promote("org-1", "r_2", "tom");
    expect(second).toMatchObject({ releaseId: "r_2", previousReleaseId: "r_1" });

    const back = await pointer.rollback("org-1", "tom");
    expect(back).toMatchObject({ releaseId: "r_1", previousReleaseId: "r_2" });
  });

  it("refuses rollback with no previous release", async () => {
    const { store, releases, evidence } = fixtures(new Map([["r_1", release("r_1", "ready")]]));
    const pointer = createReleasePointerService(store, releases, evidence);

    await pointer.promote("org-1", "r_1", "tom");
    await expect(pointer.rollback("org-1", "tom")).rejects.toBeInstanceOf(ConflictError);
  });

  it("projects the client bundle URL from the release artifact", async () => {
    const { store, releases, evidence } = fixtures(new Map([["r_1", release("r_1", "ready")]]));
    const pointer = createReleasePointerService(store, releases, evidence);
    await pointer.promote("org-1", "r_1", "tom");

    expect(await pointer.clientBundle("org-1")).toEqual({
      releaseId: "r_1",
      url: "tenants/org-1/releases/r_1/remoteEntry.js",
      hash: "sha256:r_1",
      version: "r_1",
    });
  });

  it("returns null with no pointer or no client bundle", async () => {
    const { store, releases, evidence } = fixtures(
      new Map([
        ["r_1", release("r_1", "ready")],
        ["r_2", release("r_2", "ready", false)],
      ]),
    );
    const pointer = createReleasePointerService(store, releases, evidence);

    expect(await pointer.clientBundle("org-1")).toBeNull();
    await pointer.promote("org-1", "r_2", "tom");
    expect(await pointer.clientBundle("org-1")).toBeNull();
  });
});
