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

export interface RoleLookupOptions {
  projectId?: string;
  /**
   * Opt-in ONLY, and never in a deployed environment.
   *
   * When the configured `ZITADEL_PROJECT_ID` yields no roles, this makes the
   * lookup scan EVERY `urn:zitadel:iam:org:project:*:roles` claim in the token.
   * Role *names* are not namespaced per project, so a role called `admin` in an
   * unrelated project then reads as the platform `admin`. It exists solely to
   * survive a stale local `ZITADEL_PROJECT_ID` during development.
   */
  allowProjectIdFallback?: boolean;
}

/**
 * Single policy for the fallback flag, so every runtime agrees.
 * `NODE_ENV=production` always wins: a stray env var cannot enable it there.
 */
export function allowProjectIdFallbackFromEnv(env: {
  ZITADEL_ALLOW_PROJECT_ID_FALLBACK?: string | undefined;
  NODE_ENV?: string | undefined;
}): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.ZITADEL_ALLOW_PROJECT_ID_FALLBACK === "true";
}

/** Parse platform role keys from a ZITADEL JWT or userinfo payload. */
export function rolesFromTokenPayload(
  payload: Record<string, unknown>,
  options?: RoleLookupOptions,
): PlatformRole[] {
  const found = new Set<PlatformRole>();

  const claimKeys = projectRolesClaimKeys(payload, options?.projectId);
  for (const claimKey of claimKeys) {
    for (const role of roleKeysFromClaim(payload[claimKey])) {
      found.add(role);
    }
  }

  // Local-dev only, and off unless explicitly enabled — see RoleLookupOptions.
  if (found.size === 0 && options?.projectId && options.allowProjectIdFallback === true) {
    for (const claimKey of projectRolesClaimKeys(payload)) {
      for (const role of roleKeysFromClaim(payload[claimKey])) {
        found.add(role);
      }
    }
  }

  // NOTE: `urn:zitadel:iam:org:projects:roles` is deliberately NOT accepted.
  // It aggregates role *names* across every project the token can see, so a role
  // called `admin` in an unrelated project would be read as the platform `admin`.
  // Only project-scoped claim keys (above) are trusted.

  return [...found];
}
