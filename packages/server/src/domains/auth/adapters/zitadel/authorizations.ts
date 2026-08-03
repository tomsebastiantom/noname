import { isStaffRole, type PlatformRole, primaryTeamRole, type StaffRole } from "@noname/auth";
import { connectRequest } from "./management";

interface AuthorizationRole {
  key?: string;
}

interface AuthorizationRow {
  id?: string;
  user?: { id?: string };
  project?: { id?: string };
  organization?: { id?: string };
  roles?: AuthorizationRole[];
}

interface ListAuthorizationsResponse {
  authorizations?: AuthorizationRow[];
}

const AUTH_SERVICE = "/zitadel.authorization.v2.AuthorizationService";

export async function listProjectAuthorizations(
  orgId: string,
  projectId: string,
): Promise<AuthorizationRow[]> {
  const body = await connectRequest<ListAuthorizationsResponse>(
    orgId,
    `${AUTH_SERVICE}/ListAuthorizations`,
    {
      pagination: { limit: 1000, offset: 0 },
    },
  );

  return (body.authorizations ?? []).filter(
    (row) => row.project?.id === projectId && row.organization?.id === orgId,
  );
}

/** userId → primary staff role from ZITADEL project authorizations. */
export async function teamRoleAssignments(
  orgId: string,
  projectId: string,
): Promise<Map<string, StaffRole>> {
  const rows = await listProjectAuthorizations(orgId, projectId);
  const map = new Map<string, StaffRole>();

  for (const row of rows) {
    const userId = row.user?.id?.trim();
    if (!userId) continue;

    const roles: PlatformRole[] = [];
    for (const role of row.roles ?? []) {
      const key = role.key?.trim();
      if (key && isStaffRole(key)) {
        roles.push(key);
      }
    }
    const primary = primaryTeamRole(roles);
    if (primary && isStaffRole(primary)) {
      map.set(userId, primary);
    }
  }

  return map;
}

async function findAuthorizationId(
  orgId: string,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const rows = await listProjectAuthorizations(orgId, projectId);
  const match = rows.find((row) => row.user?.id === userId);
  return match?.id?.trim() || null;
}

/** Create or update a user's staff role on the platform project. */
export async function upsertUserTeamRole(
  orgId: string,
  projectId: string,
  userId: string,
  role: StaffRole,
): Promise<void> {
  const authorizationId = await findAuthorizationId(orgId, projectId, userId);

  if (authorizationId) {
    await connectRequest(orgId, `${AUTH_SERVICE}/UpdateAuthorization`, {
      id: authorizationId,
      roleKeys: [role],
    });
    return;
  }

  await connectRequest(orgId, `${AUTH_SERVICE}/CreateAuthorization`, {
    userId,
    projectId,
    organizationId: orgId,
    roleKeys: [role],
  });
}
