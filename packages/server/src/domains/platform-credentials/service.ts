import type { EvidenceService } from "../evidence/ports";
import {
  CREDENTIAL_ACTION_VALUES,
  CREDENTIAL_ACTIONS,
  CREDENTIAL_SUBJECT_TYPE,
  type CredentialEventInput,
} from "./actions";

export type CredentialGrant = {
  accountId: string;
  role: string;
};

export type ReconcileInput = {
  /** Grants that exist in the IdP right now. */
  liveGrants: CredentialGrant[];
  /** Grants our stream says were granted and not revoked. */
  recordedGrants: CredentialGrant[];
};

export type ReconcileReport = {
  live: number;
  recorded: number;
  /** In the IdP, never recorded — a console change, or provisioning that did not emit. */
  unrecorded: CredentialGrant[];
  /** Recorded as granted, no longer in the IdP — a revocation nobody recorded. */
  stale: CredentialGrant[];
  clean: boolean;
};

const key = (grant: CredentialGrant) => `${grant.accountId}\u0000${grant.role}`;

/** Pure so the interesting part is testable without ZITADEL or Postgres. */
export function reconcileGrants(input: ReconcileInput): ReconcileReport {
  const live = new Map(input.liveGrants.map((grant) => [key(grant), grant]));
  const recorded = new Map(input.recordedGrants.map((grant) => [key(grant), grant]));

  const unrecorded = [...live.entries()]
    .filter(([mapKey]) => !recorded.has(mapKey))
    .map(([, grant]) => grant);
  const stale = [...recorded.entries()]
    .filter(([mapKey]) => !live.has(mapKey))
    .map(([, grant]) => grant);

  return {
    live: live.size,
    recorded: recorded.size,
    unrecorded,
    stale,
    // "Clean" must mean both directions agree. A missing stream entry is drift, not a gap to be assumed benign.
    clean: unrecorded.length === 0 && stale.length === 0,
  };
}

function platformOrgId(): string {
  const orgId = process.env.PLATFORM_ORG_ID?.trim();
  if (!orgId) {
    throw new Error("PLATFORM_ORG_ID is not configured; credential events are platform-scoped");
  }
  return orgId;
}

/**
 * Write one credential-lifecycle row.
 *
 * Fail closed: without `PLATFORM_ORG_ID` there is no correct scope, and writing the row under a tenant org would
 * put platform credential facts in a tenant's audit stream.
 */
export async function recordCredentialEvent(
  evidence: EvidenceService,
  input: CredentialEventInput,
): Promise<{ id: string }> {
  // A tenant-scoped credential (eval account) belongs to that tenant; everything else is platform scope.
  const orgId = input.orgId?.trim() || platformOrgId();
  const event = await evidence.audit({
    orgId,
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId,
    subjectType: CREDENTIAL_SUBJECT_TYPE,
    subjectId: input.accountId,
    ...(input.reason ? { reason: input.reason } : {}),
    metadata: {
      ...(input.accountName ? { accountName: input.accountName } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.keyId ? { keyId: input.keyId } : {}),
    },
    // One row per (action, account, role) transition: a replayed provisioning run must not duplicate the fact.
    idempotencyKey: `${input.action}:${input.accountId}:${input.role ?? input.keyId ?? "account"}`,
  });
  return { id: event.id };
}

/** Grants our stream believes are active: `granted` rows whose (account, role) was never later revoked. */
export async function readRecordedGrants(
  evidence: EvidenceService,
  orgId = platformOrgId(),
): Promise<CredentialGrant[]> {
  const events = await evidence.listAuditAcross({
    orgId,
    subjectType: CREDENTIAL_SUBJECT_TYPE,
    limit: 1000,
  });

  const active = new Map<string, CredentialGrant>();
  // Oldest first so a later `revoked` removes an earlier `granted`.
  for (const event of [...events].reverse()) {
    const accountId = event.subjectId;
    const role = typeof event.metadata?.role === "string" ? event.metadata.role : undefined;
    if (!accountId || !role) continue;
    const grant = { accountId, role };
    if (event.action === CREDENTIAL_ACTIONS.GRANTED) active.set(key(grant), grant);
    if (event.action === CREDENTIAL_ACTIONS.REVOKED) active.delete(key(grant));
  }
  return [...active.values()];
}

export { CREDENTIAL_ACTION_VALUES, CREDENTIAL_ACTIONS, CREDENTIAL_SUBJECT_TYPE };
