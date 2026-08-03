import {
  canAssignRole,
  expandPermissionsFromKeys,
  isPlatformRole,
  type PlatformRole,
  primaryTeamRole,
  resolveRolesFromTokenPayload,
} from "@noname/auth";
import type { Context } from "hono";
import { ValidationError } from "../../../shared/domain-error";
import { zitadelIssuer } from "../adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "../adapters/zitadel/project-id";
import { bearerToken, requireAuthenticatedUser } from "../guards";

export async function assignerPlatformRoles(c: Context): Promise<PlatformRole[]> {
  const auth = requireAuthenticatedUser(c);
  if (auth instanceof Response) return [];

  const token = bearerToken(c);
  if (!token) return [];

  const payload = await resolveRolesFromTokenPayload(
    token,
    {},
    {
      projectId: zitadelProjectIdOrNull() ?? undefined,
      issuer: zitadelIssuer(),
    },
  );
  return payload.filter(isPlatformRole);
}

export async function assertCanAssignRole(c: Context, targetRole: string): Promise<void> {
  const assignerRoles = await assignerPlatformRoles(c);
  if (!canAssignRole(assignerRoles, targetRole)) {
    throw new ValidationError("role", "Cannot assign this role");
  }
}

export async function resolveAssignerPermissions(c: Context): Promise<PlatformRole[]> {
  return assignerPlatformRoles(c);
}

/** Primary staff role for user list display. */
export function displayRoleFromKeys(roleKeys: string[]): PlatformRole {
  const roles = roleKeys.filter(isPlatformRole);
  return primaryTeamRole(roles) ?? "editor";
}

export { expandPermissionsFromKeys };
