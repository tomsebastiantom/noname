import { describe, expect, it } from "vitest";
import { ConflictError } from "../../shared/domain-error";
import type { EvidenceAuditInput, EvidenceService } from "../evidence/ports";
import { createEnvironmentService } from "./environment-service";
import type {
  EnvironmentStore,
  ReleaseDTO,
  ReleaseEnvironmentDTO,
  ReleaseService,
  ReleaseState,
} from "./ports";

function release(id: string, state: ReleaseState): ReleaseDTO {
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
    artifacts: [],
  };
}

function fixtures(releasesById: Map<string, ReleaseDTO>) {
  const rows = new Map<string, ReleaseEnvironmentDTO>();
  const store: EnvironmentStore = {
    async get(orgId, name) {
      const row = rows.get(`${orgId}:${name}`);
      return row ?? null;
    },
    async list(orgId) {
      return [...rows.values()].filter((row) => row.orgId === orgId);
    },
    async setActive(orgId, name, activeReleaseId, previousReleaseId, updatedBy) {
      const key = `${orgId}:${name}`;
      const row: ReleaseEnvironmentDTO = {
        id: key,
        orgId,
        name,
        activeReleaseId,
        previousReleaseId,
        updatedBy,
        updatedAt: new Date(),
      };
      rows.set(key, row);
      return row;
    },
  };

  const service = {
    async get(_orgId, id) {
      const found = releasesById.get(id);
      if (!found) throw new Error(`unknown release ${id}`);
      return found;
    },
  } as unknown as ReleaseService;

  const recorded: EvidenceAuditInput[] = [];
  const evidence = {
    async audit(input: EvidenceAuditInput) {
      recorded.push(input);
      return { ...input, id: `ev-${recorded.length}`, recordedAt: new Date() };
    },
  } as unknown as EvidenceService;

  return { store, service, evidence, recorded };
}

describe("environment selector", () => {
  it("activates a ready release and records one switch", async () => {
    const releases = new Map([["r_1", release("r_1", "ready")]]);
    const { store, service, evidence, recorded } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    const row = await environments.activate("org-1", "r_1", "production", "tom");

    expect(row).toMatchObject({
      activeReleaseId: "r_1",
      previousReleaseId: null,
      updatedBy: "tom",
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: "platform.release.environment_switched",
      subjectType: "platform.environment",
      subjectId: "production",
      metadata: { environment: "production", from: null, to: "r_1", rollback: false },
    });
  });

  it("keeps the old release as previous on the next switch", async () => {
    const releases = new Map([
      ["r_1", release("r_1", "ready")],
      ["r_2", release("r_2", "ready")],
    ]);
    const { store, service, evidence } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await environments.activate("org-1", "r_1", "production", "tom");
    const row = await environments.activate("org-1", "r_2", "production", "tom");

    expect(row).toMatchObject({ activeReleaseId: "r_2", previousReleaseId: "r_1" });
  });

  it("refuses a release that is not ready", async () => {
    const releases = new Map([["r_1", release("r_1", "building")]]);
    const { store, service, evidence, recorded } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await expect(environments.activate("org-1", "r_1", "production", "tom")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(recorded).toHaveLength(0);
    expect(await store.get("org-1", "production")).toBeNull();
  });

  it("is a no-op when the release is already active", async () => {
    const releases = new Map([["r_1", release("r_1", "ready")]]);
    const { store, service, evidence, recorded } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await environments.activate("org-1", "r_1", "production", "tom");
    const again = await environments.activate("org-1", "r_1", "production", "tom");

    expect(again.activeReleaseId).toBe("r_1");
    expect(recorded).toHaveLength(1);
  });

  it("rolls back by swapping active and previous", async () => {
    const releases = new Map([
      ["r_1", release("r_1", "ready")],
      ["r_2", release("r_2", "ready")],
    ]);
    const { store, service, evidence } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await environments.activate("org-1", "r_1", "production", "tom");
    await environments.activate("org-1", "r_2", "production", "tom");
    const row = await environments.rollback("org-1", "production", "tom");

    expect(row).toMatchObject({ activeReleaseId: "r_1", previousReleaseId: "r_2" });
  });

  it("refuses rollback with no previous release", async () => {
    const releases = new Map([["r_1", release("r_1", "ready")]]);
    const { store, service, evidence } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await expect(environments.rollback("org-1", "production", "tom")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("preview does not touch production", async () => {
    const releases = new Map([
      ["r_1", release("r_1", "ready")],
      ["r_2", release("r_2", "ready")],
    ]);
    const { store, service, evidence } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await environments.activate("org-1", "r_1", "production", "tom");
    await environments.preview("org-1", "r_2", "tom");

    expect((await store.get("org-1", "production"))?.activeReleaseId).toBe("r_1");
    expect((await store.get("org-1", "preview"))?.activeReleaseId).toBe("r_2");
  });

  it("lists environments per org", async () => {
    const releases = new Map([["r_1", release("r_1", "ready")]]);
    const { store, service, evidence } = fixtures(releases);
    const environments = createEnvironmentService(store, service, evidence);

    await environments.activate("org-1", "r_1", "preview", "tom");

    expect(await environments.list("org-1")).toHaveLength(1);
    expect(await environments.list("org-2")).toHaveLength(0);
  });
});
