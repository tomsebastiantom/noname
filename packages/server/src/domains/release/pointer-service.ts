import { ConflictError } from "../../shared/domain-error";
import type { EvidenceService } from "../evidence/ports";
import type {
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
 * Promotion is one row, and rollback swaps active/previous.
 */
export function createReleasePointerService(
  store: PointerStore,
  releases: ReleaseService,
  evidence?: EvidenceService,
): ReleasePointerService {
  const promote = async (
    orgId: string,
    releaseId: string,
    actor: string,
  ): Promise<TenantReleasePointerDTO> => {
    const release = await releases.get(orgId, releaseId);
    if (release.state !== "ready") {
      throw new ConflictError(
        `Release ${releaseId} is ${release.state}; only a ready release can be promoted`,
        { id: releaseId, state: release.state },
      );
    }

    const current = await store.get(orgId);
    if (current?.releaseId === releaseId) return current;

    const updated = await store.set(orgId, releaseId, current?.releaseId ?? null, actor);
    await recordPointer(evidence, {
      orgId,
      from: current?.releaseId ?? null,
      to: releaseId,
      actor,
      rollback: false,
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

      const updated = await store.set(orgId, current.previousReleaseId, current.releaseId, actor);
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

      let release: ReleaseDTO;
      try {
        release = await releases.get(orgId, pointer.releaseId);
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
  };
}

async function recordPointer(
  evidence: EvidenceService | undefined,
  input: { orgId: string; from: string | null; to: string; actor: string; rollback: boolean },
): Promise<void> {
  if (!evidence) return;
  await evidence.appendRecord({
    orgId: input.orgId,
    type: "platform.release.tenant_promoted",
    subjectType: "tenant.storefront",
    subjectId: input.orgId,
    source: "release.pointer",
    correlationId: `${input.orgId}:${input.to}`,
    data: {
      tenant: input.orgId,
      from: input.from,
      to: input.to,
      actor: input.actor,
      rollback: input.rollback,
    },
  });
}
