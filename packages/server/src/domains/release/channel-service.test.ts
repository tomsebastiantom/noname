import { describe, expect, it } from "vitest";
import { ConflictError } from "../../shared/domain-error";
import type { EvidenceAuditInput, EvidenceService } from "../evidence/ports";
import { createChannelService } from "./channel-service";
import type {
  ChannelStore,
  ReleaseChannelDTO,
  ReleaseDTO,
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
  const rows = new Map<string, ReleaseChannelDTO>();
  const store: ChannelStore = {
    async get(_orgId, channel) {
      return rows.get(channel) ?? null;
    },
    async list() {
      return [...rows.values()];
    },
    async set(orgId, channel, releaseId, previousReleaseId, updatedBy) {
      const row: ReleaseChannelDTO = {
        id: `c-${channel}`,
        orgId,
        channel,
        releaseId,
        previousReleaseId,
        updatedBy,
        updatedAt: new Date(),
      };
      rows.set(channel, row);
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

  const recorded: EvidenceAuditInput[] = [];
  const evidence = {
    async audit(input: EvidenceAuditInput) {
      recorded.push(input);
      return { ...input, id: `ev-${recorded.length}`, recordedAt: new Date() };
    },
  } as unknown as EvidenceService;

  return { rows, store, releases, evidence, recorded };
}

describe("release channels", () => {
  it("moves a ring to a ready release and records one move", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([["r_1", release("r_1", "ready")]]),
    );
    const channels = createChannelService(store, releases, evidence);

    const row = await channels.activate("org-1", "canary", "r_1", "tom");

    expect(row).toMatchObject({ channel: "canary", releaseId: "r_1", previousReleaseId: null });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: "platform.release.channel_moved",
      subjectType: "platform.release_channel",
      subjectId: "canary",
      metadata: { channel: "canary", to: "r_1", rollback: false },
    });
  });

  it("refuses a release that is not ready", async () => {
    const { store, releases } = fixtures(new Map([["r_1", release("r_1", "building")]]));
    const channels = createChannelService(store, releases);

    await expect(channels.activate("org-1", "canary", "r_1", "tom")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("is a no-op when the ring already points at the release", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([["r_1", release("r_1", "ready")]]),
    );
    const channels = createChannelService(store, releases, evidence);
    await channels.activate("org-1", "canary", "r_1", "tom");

    await channels.activate("org-1", "canary", "r_1", "tom");
    expect(recorded).toHaveLength(1);
  });

  it("rolls back to the previous release", async () => {
    const { store, releases, evidence, recorded } = fixtures(
      new Map([
        ["r_1", release("r_1", "ready")],
        ["r_2", release("r_2", "ready")],
      ]),
    );
    const channels = createChannelService(store, releases, evidence);
    await channels.activate("org-1", "canary", "r_1", "tom");
    await channels.activate("org-1", "canary", "r_2", "tom");

    const row = await channels.rollback("org-1", "canary", "tom");

    expect(row).toMatchObject({ releaseId: "r_1", previousReleaseId: "r_2" });
    expect(recorded.at(-1)?.metadata).toMatchObject({ rollback: true, from: "r_2", to: "r_1" });
  });

  it("refuses rollback without a previous release", async () => {
    const { store, releases } = fixtures(new Map([["r_1", release("r_1", "ready")]]));
    const channels = createChannelService(store, releases);
    await channels.activate("org-1", "canary", "r_1", "tom");

    await expect(channels.rollback("org-1", "canary", "tom")).rejects.toBeInstanceOf(ConflictError);
  });
});
