import { ConflictError, NotFoundError } from "../../shared/domain-error";
import { currentRequestId } from "../../shared/request-context";
import type { EvidenceService } from "../evidence/ports";
import { auditActorType } from "./audit-actor";
import { assertMigrationsPromotable } from "./migration-policy";
import type { ChannelService, ChannelStore, ReleaseChannelDTO, ReleaseService } from "./ports";

/**
 * D3 — tenant rings.
 *
 * A channel is one row; moving it moves every tenant whose pointer names it. The release must be ready and pass
 * the D16 migration gate, exactly like a direct tenant promotion. Evidence records one move per ring.
 */
export function createChannelService(
  store: ChannelStore,
  releases: ReleaseService,
  evidence?: EvidenceService,
): ChannelService {
  const get = async (orgId: string, channel: string): Promise<ReleaseChannelDTO> => {
    const existing = await store.get(orgId, channel);
    if (!existing) throw new NotFoundError("ReleaseChannel", `${orgId}/${channel}`);
    return existing;
  };

  return {
    list: (orgId) => store.list(orgId),
    get,

    async activate(orgId, channel, releaseId, actor) {
      const release = await releases.get(orgId, releaseId);
      if (release.state !== "ready") {
        throw new ConflictError(
          `Release ${releaseId} is ${release.state}; only a ready release can move a channel`,
          { id: releaseId, state: release.state },
        );
      }

      const current = await store.get(orgId, channel);
      if (current?.releaseId === releaseId) return current;

      assertMigrationsPromotable(release);

      const updated = await store.set(orgId, channel, releaseId, current?.releaseId ?? null, actor);
      await recordChannel(evidence, {
        orgId,
        channel,
        from: current?.releaseId ?? null,
        to: releaseId,
        actor,
        rollback: false,
      });
      return updated;
    },

    async rollback(orgId, channel, actor) {
      const current = await get(orgId, channel);
      if (!current.previousReleaseId) {
        throw new ConflictError(`Channel ${channel} has no previous release to roll back to`, {
          channel,
        });
      }

      const updated = await store.set(
        orgId,
        channel,
        current.previousReleaseId,
        current.releaseId,
        actor,
      );
      await recordChannel(evidence, {
        orgId,
        channel,
        from: current.releaseId,
        to: current.previousReleaseId,
        actor,
        rollback: true,
      });
      return updated;
    },
  };
}

async function recordChannel(
  evidence: EvidenceService | undefined,
  input: {
    orgId: string;
    channel: string;
    from: string | null;
    to: string;
    actor: string;
    rollback: boolean;
  },
): Promise<void> {
  if (!evidence) return;
  await evidence.audit({
    orgId: input.orgId,
    action: "platform.release.channel_moved",
    actorType: auditActorType(input.actor),
    actorId: input.actor,
    subjectType: "platform.release_channel",
    subjectId: input.channel,
    reason: input.rollback ? "rollback" : undefined,
    metadata: {
      channel: input.channel,
      from: input.from,
      to: input.to,
      releaseId: input.to,
      rollback: input.rollback,
      requestId: currentRequestId(),
    },
    correlationId: `${input.orgId}:${input.channel}:${input.to}`,
    idempotencyKey: `channel_moved:${input.orgId}:${input.channel}:${input.from ?? "none"}:${input.to}`,
  });
}
