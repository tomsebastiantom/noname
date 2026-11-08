import { ConflictError } from "../../shared/domain-error";
import { currentRequestId } from "../../shared/request-context";
import type { EvidenceService } from "../evidence/ports";
import { auditActorType } from "./audit-actor";
import { assertMigrationsPromotable } from "./migration-policy";
import type {
  EnvironmentService,
  EnvironmentStore,
  ReleaseEnvironmentDTO,
  ReleaseService,
} from "./ports";

/**
 * D15 control plane: one row per environment saying which release is active and which one rollback returns to.
 * Deployment consumes the row; this service only writes it.
 */
export function createEnvironmentService(
  store: EnvironmentStore,
  releases: ReleaseService,
  evidence?: EvidenceService,
): EnvironmentService {
  const switchTo = async (
    orgId: string,
    environment: string,
    releaseId: string,
    actor: string,
  ): Promise<ReleaseEnvironmentDTO> => {
    const release = await releases.get(orgId, releaseId);
    if (release.state !== "ready") {
      throw new ConflictError(
        `Release ${releaseId} is ${release.state}; only a ready release can be activated`,
        { id: releaseId, state: release.state },
      );
    }

    const current = await store.get(orgId, environment);
    if (current?.activeReleaseId === releaseId) return current;

    assertMigrationsPromotable(release);

    const updated = await store.setActive(
      orgId,
      environment,
      releaseId,
      current?.activeReleaseId ?? null,
      actor,
    );

    await recordSwitch(evidence, {
      orgId,
      environment,
      from: current?.activeReleaseId ?? null,
      to: releaseId,
      actor,
      rollback: false,
    });

    return updated;
  };

  return {
    preview: (orgId, releaseId, actor) => switchTo(orgId, "preview", releaseId, actor),
    activate: (orgId, releaseId, environment, actor) =>
      switchTo(orgId, environment, releaseId, actor),

    async rollback(orgId, environment, actor) {
      const current = await store.get(orgId, environment);
      if (!current?.previousReleaseId) {
        throw new ConflictError(
          `Environment ${environment} has no previous release to roll back to`,
          {
            environment,
          },
        );
      }

      const updated = await store.setActive(
        orgId,
        environment,
        current.previousReleaseId,
        current.activeReleaseId,
        actor,
      );

      await recordSwitch(evidence, {
        orgId,
        environment,
        from: current.activeReleaseId,
        to: current.previousReleaseId,
        actor,
        rollback: true,
      });

      return updated;
    },

    list: (orgId) => store.list(orgId),
  };
}

async function recordSwitch(
  evidence: EvidenceService | undefined,
  input: {
    orgId: string;
    environment: string;
    from: string | null;
    to: string;
    actor: string;
    rollback: boolean;
  },
): Promise<void> {
  if (!evidence) return;
  await evidence.audit({
    orgId: input.orgId,
    action: "platform.release.environment_switched",
    actorType: auditActorType(input.actor),
    actorId: input.actor,
    subjectType: "platform.environment",
    subjectId: input.environment,
    reason: input.rollback ? "rollback" : undefined,
    metadata: {
      environment: input.environment,
      from: input.from,
      to: input.to,
      releaseId: input.to,
      rollback: input.rollback,
      requestId: currentRequestId(),
    },
    correlationId: `${input.orgId}:${input.environment}:${input.to}`,
    idempotencyKey: `environment_switched:${input.orgId}:${input.environment}:${input.from ?? "none"}:${input.to}`,
  });
}
