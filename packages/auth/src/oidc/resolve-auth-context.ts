import { orgIdFromTokenPayload } from "../jwt/claims";
import { decodeAccessTokenPayload } from "../jwt/decode";
import { rolesFromTokenPayload } from "../jwt/roles";
import {
  expandPermissions,
  type PermissionKey,
  type PlatformRole,
  primaryRoleFromKeys,
} from "../permissions";
import { rolesFromUserinfo } from "./userinfo";

export function rolesFromJwt(
  payload: Record<string, unknown>,
  options?: { projectId?: string },
): PlatformRole[] {
  return rolesFromTokenPayload(payload, options);
}

export function permissionsFromJwt(
  payload: Record<string, unknown>,
  options?: { projectId?: string },
): PermissionKey[] {
  return expandPermissions(rolesFromJwt(payload, options));
}

/** @deprecated Use `staffUiRoleFromJwt` — legacy two-role admin|editor helper for old UI. */
export function teamRoleFromJwt(
  payload: Record<string, unknown>,
  options?: { projectId?: string },
): "admin" | "editor" | null {
  return staffUiRoleFromJwt(payload, options);
}

/** Highest legacy staff UI role when only admin vs editor mattered. */
export function staffUiRoleFromJwt(
  payload: Record<string, unknown>,
  options?: { projectId?: string },
): "admin" | "editor" | null {
  const roles = rolesFromJwt(payload, options);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("editor")) return "editor";
  return null;
}

/** Resolve roles from a verified JWT payload, falling back to OIDC userinfo. */
export async function resolveRolesFromTokenPayload(
  accessToken: string,
  payload: Record<string, unknown>,
  options?: { projectId?: string; issuer?: string },
): Promise<PlatformRole[]> {
  let roles = rolesFromJwt(payload, options);
  if (roles.length === 0 && options?.issuer) {
    roles = await rolesFromUserinfo(accessToken, options.issuer, options.projectId);
  }
  return roles;
}

/** Org/user identity + roles from a verified JWT payload. */
export async function resolveIdentityFromTokenPayload(
  accessToken: string,
  payload: Record<string, unknown>,
  options?: { projectId?: string; issuer?: string },
): Promise<{
  orgId: string;
  userId: string;
  roles: PlatformRole[];
  role: PlatformRole;
}> {
  const roles = await resolveRolesFromTokenPayload(accessToken, payload, options);
  return {
    orgId: orgIdFromTokenPayload(payload),
    userId: typeof payload.sub === "string" ? payload.sub : "",
    roles,
    role: primaryRoleFromKeys(roles),
  };
}

/** Resolve roles/permissions from JWT, falling back to OIDC userinfo when roles are omitted. */
export async function resolveAuthContextFromAccessToken(
  accessToken: string,
  options?: { projectId?: string; issuer?: string },
): Promise<{ roles: PlatformRole[]; permissions: PermissionKey[] }> {
  const payload = decodeAccessTokenPayload(accessToken);
  if (!payload) return { roles: [], permissions: [] };

  const roles = await resolveRolesFromTokenPayload(accessToken, payload, options);
  return { roles, permissions: expandPermissions(roles) };
}
