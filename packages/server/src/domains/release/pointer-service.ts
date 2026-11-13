import { ConflictError, NotFoundError } from "../../shared/domain-error";
import { currentRequestId } from "../../shared/request-context";
import type { EvidenceService } from "../evidence/ports";
import { auditActorType } from "./audit-actor";
import { assertMigrationsPromotable } from "./migration-policy";
import type {
  ChannelStore,
  ClientBundleRef,
  PointerStore,
  ReleaseDTO,
  ReleasePointerService,
  ReleaseService,
  TenantReleasePointerDTO,
} from "./ports";

/**
 * D1 C1 — the client-side pointer.
 *
 * The tenant catalog asks this service for a bundle URL; the release domain never imports the tenant domain.
 * Promotion is one row, and rollback swaps active/previous. D3 adds a nullable channel: when set it wins over the
 * pinned release, so moving a ring is one channel write.
 */
export function createReleasePointerService(
  store: PointerStore,
  channels: ChannelStore,
  releases: ReleaseService,
  evidence?: EvidenceService,
): ReleasePointerService {
  const promote = async (
    orgId: string,
    releaseId: string,
    actor: string,
    options: { platformOrgId?: string; actorType?: "user" | "system" | "service" } = {},
  ): Promise<TenantReleasePointerDTO> => {
    // A tenant-scoped promote may only reference that tenant's own release. A platform wave is different: the
    // release is owned by the **platform** org and every tenant points at the same one, so the lookup has to span
    // orgs — but only when the caller names the platform org as the owner, never as a general escape hatch.
    const platformOrgId = options.platformOrgId?.trim();
    const release = platformOrgId
      ? await releases.getAnyOrg(releaseId)
      : await releases.get(orgId, releaseId);
    if (platformOrgId && release.orgId !== platformOrgId) {
      throw new NotFoundError("Release", releaseId);
    }
    if (release.state !== "ready") {
      throw new ConflictError(
        `Release ${releaseId} is ${release.state}; only a ready release can be promoted`,
        { id: releaseId, state: release.state },
      );
    }

    const current = await store.get(orgId);
    if (current?.releaseId === releaseId) return current;

    assertMigrationsPromotable(release);

    const updated = await store.set(orgId, releaseId, current?.releaseId ?? null, actor, null);
    await recordPointer(evidence, {
      orgId,
      from: current?.releaseId ?? null,
      to: releaseId,
      actor,
      rollback: false,
      ...(options.actorType ? { actorType: options.actorType } : {}),
    });
    return updated;
  };

  return {
    get: (orgId) => store.get(orgId),
    promote,

    async rollback(orgId, actor) {
      const current = await store.get(orgId);
      if (!current?.previousReleaseId) {
        throw new ConflictError(`Tenant ${orgId} has no previous release to roll back to`, {
          orgId,
        });
      }

      const updated = await store.set(
        orgId,
        current.previousReleaseId,
        current.releaseId,
        actor,
        null,
      );
      await recordPointer(evidence, {
        orgId,
        from: current.releaseId,
        to: current.previousReleaseId,
        actor,
        rollback: true,
      });
      return updated;
    },

    async clientBundle(orgId): Promise<ClientBundleRef | null> {
      const pointer = await store.get(orgId);
      if (!pointer) return null;

      // A channel wins over the pinned release; a pointer with a channel whose row disappeared is not
      // allowed to fall back silently to a stale pin.
      let releaseId = pointer.releaseId;
      if (pointer.channel) {
        const channel = await channels.get(orgId, pointer.channel);
        if (!channel) return null;
        releaseId = channel.releaseId;
      }

      let release: ReleaseDTO;
      try {
        release = await releases.get(orgId, releaseId);
      } catch {
        return null;
      }

      const artifact = release.artifacts.find((candidate) => candidate.kind === "client_bundle");
      if (!artifact) return null;

      return {
        releaseId: release.id,
        url: artifact.ref,
        hash: artifact.digest,
        version: release.id,
      };
    },

    async assignChannel(orgId, channelName, actor) {
      const channel = await channels.get(orgId, channelName);
      if (!channel) {
        throw new ConflictError(`Channel ${channelName} does not exist`, { channel: channelName });
      }

      const current = await store.get(orgId);
      const updated = await store.set(
        orgId,
        channel.releaseId,
        current?.releaseId ?? null,
        actor,
        channelName,
      );
      await recordPointer(evidence, {
        orgId,
        from: current?.releaseId ?? null,
        to: channel.releaseId,
        actor,
        rollback: false,
      });
      return updated;
    },

    async clearChannel(orgId, actor) {
      const current = await store.get(orgId);
      if (!current) throw new ConflictError(`Tenant ${orgId} has no release pointer`, { orgId });

      return store.set(orgId, current.releaseId, current.previousReleaseId, actor, null);
    },
  };
}

async function recordPointer(
  evidence: EvidenceService | undefined,
  input: {
    orgId: string;
    from: string | null;
    to: string;
    actor: string;
    rollback: boolean;
    /** Set by a platform wave so the row is attributed to a service account, not a person. */
    actorType?: "user" | "system" | "service";
  },
): Promise<void> {
  if (!evidence) return;
  const action = input.rollback
    ? "platform.release.tenant_rolled_back"
    : "platform.release.tenant_promoted";

  await evidence.audit({
    orgId: input.orgId,
    action,
    actorType: input.actorType ?? auditActorType(input.actor),
    actorId: input.actor,
    subjectType: "tenant.storefront",
    subjectId: input.orgId,
    reason: input.rollback ? "rollback" : undefined,
    metadata: {
      from: input.from,
      to: input.to,
      releaseId: input.to,
      rollback: input.rollback,
      requestId: currentRequestId(),
    },
    correlationId: `${input.orgId}:${input.to}`,
    idempotencyKey: `${action}:${input.orgId}:${input.from ?? "none"}:${input.to}`,
  });
}
