import {
  bindCollectionTeamEditors,
  bindCollectionTeamPublishers,
  createScopeCollection,
  createScopeTeam,
  deleteScopeCollection,
  deleteScopeTeam,
  fetchScopeAgentBindings,
  fetchScopeBindings,
  fetchScopeCollections,
  fetchScopeTeams,
  grantTeamEditor,
  grantTeamPublisher,
  revokeTeamEditor,
  revokeTeamPublisher,
  unbindCollectionAgentEditors,
  unbindCollectionTeamEditors,
  unbindCollectionTeamPublishers,
} from "../../auth/document-scope";
import { fetchTeamUsers } from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler, CatalogSetState } from "./types";

async function refreshScopeCatalog(setState: CatalogSetState): Promise<void> {
  const [collections, teams, bindings, agentBindings] = await Promise.all([
    fetchScopeCollections(),
    fetchScopeTeams(),
    fetchScopeBindings(),
    fetchScopeAgentBindings(),
  ]);
  setState(ADMIN_STATE.scope.collections, collections);
  setState(ADMIN_STATE.scope.teams, teams);
  setState(ADMIN_STATE.scope.bindings, bindings);
  setState(ADMIN_STATE.scope.agentBindings, agentBindings);
}

export const scopeActions = {
  listScopeCollections: (async (_params, setState) => {
    setState(ADMIN_STATE.scope.loading, true);
    setState(ADMIN_STATE.scope.error, null);
    try {
      setState(ADMIN_STATE.scope.collections, await fetchScopeCollections());
    } catch (err) {
      setState(
        ADMIN_STATE.scope.error,
        err instanceof Error ? err.message : "Failed to load folders",
      );
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
      const [collections, teams, bindings, agentBindings, users] = await Promise.all([
        fetchScopeCollections(),
        fetchScopeTeams(),
        fetchScopeBindings(),
        fetchScopeAgentBindings(),
        fetchTeamUsers(),
      ]);
      setState(ADMIN_STATE.scope.collections, collections);
      setState(ADMIN_STATE.scope.teams, teams);
      setState(ADMIN_STATE.scope.bindings, bindings);
      setState(ADMIN_STATE.scope.agentBindings, agentBindings);
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

  createScopeCollection: (async (params, setState) => {
    const { slug, label, parentId } = params as {
      slug: string;
      label?: string;
      parentId?: string | null;
    };
    await createScopeCollection(slug.trim(), label?.trim(), parentId ?? null);
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  createScopeTeam: (async (params, setState) => {
    const { slug, label } = params as { slug: string; label?: string };
    await createScopeTeam(slug.trim(), label?.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  bindCollectionTeamEditors: (async (params, setState) => {
    const { collection, team } = params as { collection: string; team: string };
    await bindCollectionTeamEditors(collection.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  bindCollectionTeamPublishers: (async (params, setState) => {
    const { collection, team } = params as { collection: string; team: string };
    await bindCollectionTeamPublishers(collection.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  unbindCollectionTeamEditors: (async (params, setState) => {
    const { collection, team } = params as { collection: string; team: string };
    await unbindCollectionTeamEditors(collection.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  unbindCollectionTeamPublishers: (async (params, setState) => {
    const { collection, team } = params as { collection: string; team: string };
    await unbindCollectionTeamPublishers(collection.trim(), team.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  unbindCollectionAgentEditors: (async (params, setState) => {
    const { collection, agent } = params as { collection: string; agent: string };
    await unbindCollectionAgentEditors(collection.trim(), agent.trim());
    await refreshScopeCatalog(setState);
  }) satisfies CatalogActionHandler,

  deleteScopeCollection: (async (params, setState) => {
    const { slug } = params as { slug: string };
    await deleteScopeCollection(slug.trim());
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
