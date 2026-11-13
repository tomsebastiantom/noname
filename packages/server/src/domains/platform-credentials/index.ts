import type { EvidenceService } from "../evidence/ports";
import { listProjectAuthorizations } from "../auth/adapters/zitadel/authorizations";
import { createPlatformCredentialRoutes } from "./api";
import { type CredentialEventInput, CREDENTIAL_ACTIONS } from "./actions";
import {
  type CredentialGrant,
  readRecordedGrants,
  reconcileGrants,
  recordCredentialEvent,
} from "./service";

export { CREDENTIAL_ACTIONS, CREDENTIAL_SUBJECT_TYPE } from "./actions";
export type { CredentialEventInput } from "./actions";
export { reconcileGrants, recordCredentialEvent } from "./service";

/** The platform project's live grants, read from ZITADEL. */
async function livePlatformGrants(): Promise<CredentialGrant[]> {
  const orgId = process.env.PLATFORM_ORG_ID?.trim();
  const projectId = process.env.ZITADEL_PLATFORM_PROJECT_ID?.trim();
  if (!orgId || !projectId) return [];

  const rows = await listProjectAuthorizations(orgId, projectId);
  const grants: CredentialGrant[] = [];
  for (const row of rows) {
    const accountId = row.user?.id?.trim();
    if (!accountId) continue;
    for (const role of row.roles ?? []) {
      const key = role.key?.trim();
      if (key) grants.push({ accountId, role: key });
    }
  }
  return grants;
}

export function createPlatformCredentialsDomain(deps: { evidence: EvidenceService }) {
  const record = (input: CredentialEventInput) => recordCredentialEvent(deps.evidence, input);

  return {
    record,
    reconcile: async () =>
      reconcileGrants({
        liveGrants: await livePlatformGrants(),
        recordedGrants: await readRecordedGrants(deps.evidence),
      }),
    routes: createPlatformCredentialRoutes({
      evidence: deps.evidence,
      record,
      liveGrants: livePlatformGrants,
    }),
  };
}
