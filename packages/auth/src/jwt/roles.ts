import { isPlatformRole, type PlatformRole } from "../permissions";

export function zitadelProjectRolesClaimKey(projectId: string): string {
  return `urn:zitadel:iam:org:project:${projectId}:roles`;
}

function roleKeysFromClaim(claim: unknown): PlatformRole[] {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return [];
  const roles: PlatformRole[] = [];
  for (const key of Object.keys(claim as Record<string, unknown>)) {
    if (isPlatformRole(key)) roles.push(key);
  }
  return roles;
}

function projectRolesClaimKeys(payload: Record<string, unknown>, projectId?: string): string[] {
  if (projectId) return [zitadelProjectRolesClaimKey(projectId)];
  return Object.keys(payload).filter(
    (key) => key.startsWith("urn:zitadel:iam:org:project:") && key.endsWith(":roles"),
  );
}

/** Parse platform role keys from a ZITADEL JWT or userinfo payload. */
export function rolesFromTokenPayload(
  payload: Record<string, unknown>,
  options?: { projectId?: string },
): PlatformRole[] {
  const found = new Set<PlatformRole>();

  const claimKeys = projectRolesClaimKeys(payload, options?.projectId);
  for (const claimKey of claimKeys) {
    for (const role of roleKeysFromClaim(payload[claimKey])) {
      found.add(role);
    }
  }

  // Dev: after `pnpm init:zitadel` the API may still have a stale ZITADEL_PROJECT_ID while
  // the JWT carries roles under the new project claim — accept any project roles in the token.
  if (found.size === 0 && options?.projectId) {
    for (const claimKey of projectRolesClaimKeys(payload)) {
      for (const role of roleKeysFromClaim(payload[claimKey])) {
        found.add(role);
      }
    }
  }

  const projectsRoles = payload["urn:zitadel:iam:org:projects:roles"];
  if (Array.isArray(projectsRoles)) {
    for (const entry of projectsRoles) {
      if (typeof entry === "string" && isPlatformRole(entry)) found.add(entry);
    }
  }

  return [...found];
}
