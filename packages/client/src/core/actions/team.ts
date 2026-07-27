import {
  fetchTeamUsers,
  inviteTeamUser,
  type TeamMemberRole,
  updateTeamUserRole,
} from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

async function refreshTeamUsers(setState: (path: string, value: unknown) => void): Promise<void> {
  const users = await fetchTeamUsers();
  setState(ADMIN_STATE.team.users, users);
}

export const teamActions = {
  listTeamUsers: (async (_params, setState) => {
    setState(ADMIN_STATE.team.loading, true);
    setState(ADMIN_STATE.team.error, null);
    try {
      await refreshTeamUsers(setState);
    } catch (err) {
      setState(ADMIN_STATE.team.error, err instanceof Error ? err.message : String(err));
    } finally {
      setState(ADMIN_STATE.team.loading, false);
    }
  }) satisfies CatalogActionHandler,

  inviteTeamUser: (async (params, setState) => {
    const { email, givenName, familyName, role } = params as {
      email: string;
      givenName?: string;
      familyName?: string;
      role: TeamMemberRole;
    };
    await inviteTeamUser({ email, givenName, familyName, role });
    await refreshTeamUsers(setState);
  }) satisfies CatalogActionHandler,

  updateTeamUserRole: (async (params, setState) => {
    const { userId, role } = params as { userId: string; role: TeamMemberRole };
    await updateTeamUserRole(userId, role);
    await refreshTeamUsers(setState);
  }) satisfies CatalogActionHandler,
};
