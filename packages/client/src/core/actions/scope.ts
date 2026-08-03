import {
  bindTagTeamEditors,
  bindTagTeamPublishers,
  createScopeTag,
  createScopeTeam,
  deleteScopeTag,
  deleteScopeTeam,
  fetchScopeTags,
  fetchScopeTeams,
  grantTeamEditor,
  grantTeamPublisher,
  revokeTeamEditor,
  revokeTeamPublisher,
  unbindTagTeamEditors,
  unbindTagTeamPublishers,
} from "../../auth/document-scope";
import { fetchTeamUsers } from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler, CatalogSetState } from "./types";

async function refreshScopeCatalog(setState: CatalogSetState): Promise<void> {
  const [tags, teams] = await Promise.all([fetchScopeTags(), fetchScopeTeams()]);
  setState(ADMIN_STATE.scope.tags, tags);
  setState(ADMIN_STATE.scope.teams, teams);
}

export const scopeActions = {
  listScopeTags: (async (_params, setState) => {
    setState(ADMIN_STATE.scope.loading, true);
    setState(ADMIN_STATE.scope.error, null);
    try {
      setState(ADMIN_STATE.scope.tags, await fetchScopeTags());
    } catch (err) {
      setState(ADMIN_STATE.scope.error, err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setState(ADMIN_STATE.scope.loading, false);
    }
  }) satisfies CatalogActionHandler,

  listScopeTeams: (async (_params, setState) => {
    setState(ADMIN_STATE.scope.loading, true);
    setState(ADMIN_STATE.scope.error, null);
    try {
      setState(ADMIN_STATE.scope.teams, await fetchScopeTeams());
    } catch (err) {
      setState(
        ADMIN_STATE.scope.error,
        err instanceof Error ? err.message : "Failed to load teams",
      );
    } finally {
      setState(ADMIN_STATE.scope.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadScopeAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.scope.loading, true);
    setState(ADMIN_STATE.scope.error, null);
    try {
      const [tags, teams, users] = await Promise.all([
        fetchScopeTags(),
        fetchScopeTeams(),
        fetchTeamUsers(),
      ]);
      setState(ADMIN_STATE.scope.tags, tags);
      setState(ADMIN_STATE.scope.teams, teams);
      setState(ADMIN_STATE.team.users, users);
    } catch (err) {
      setState(
        ADMIN_STATE.scope.error,
        err instanceof Error ? err.message : "Failed to load scope",
      );
    } finally {
      setState(ADMIN_STATE.scope.loading, false);
    }
  }) satisfies CatalogActionHandler,

  createScopeTag: (async (params, setState) => {
    const { slug, label } = params as { slug: string; label?: string };
    await createScopeTag(slug.trim(), label?.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  createScopeTeam: (async (params, setState) => {
    const { slug, label } = params as { slug: string; label?: string };
    await createScopeTeam(slug.trim(), label?.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  bindTagTeamEditors: (async (params, setState) => {
    const { tag, team } = params as { tag: string; team: string };
    await bindTagTeamEditors(tag.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  bindTagTeamPublishers: (async (params, setState) => {
    const { tag, team } = params as { tag: string; team: string };
    await bindTagTeamPublishers(tag.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  unbindTagTeamEditors: (async (params, setState) => {
    const { tag, team } = params as { tag: string; team: string };
    await unbindTagTeamEditors(tag.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  unbindTagTeamPublishers: (async (params, setState) => {
    const { tag, team } = params as { tag: string; team: string };
    await unbindTagTeamPublishers(tag.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  deleteScopeTag: (async (params, setState) => {
    const { slug } = params as { slug: string };
    await deleteScopeTag(slug.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  deleteScopeTeam: (async (params, setState) => {
    const { slug } = params as { slug: string };
    await deleteScopeTeam(slug.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  grantTeamEditor: (async (params, setState) => {
    const { team, userId } = params as { team: string; userId: string };
    await grantTeamEditor(team.trim(), userId);
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  revokeTeamEditor: (async (params, _setState) => {
    const { team, userId } = params as { team: string; userId: string };
    await revokeTeamEditor(team.trim(), userId);
  }) satisfies CatalogActionHandler,

  grantTeamPublisher: (async (params, setState) => {
    const { team, userId } = params as { team: string; userId: string };
    await grantTeamPublisher(team.trim(), userId);
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  revokeTeamPublisher: (async (params, _setState) => {
    const { team, userId } = params as { team: string; userId: string };
    await revokeTeamPublisher(team.trim(), userId);
  }) satisfies CatalogActionHandler,
};
