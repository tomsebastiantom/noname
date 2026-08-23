import { useStateValue } from "@json-render/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type {
  CollectionAgentBinding,
  CollectionTeamBinding,
  ScopeCatalogEntry,
  TeamMemberEntry,
} from "../../../auth/document-scope";
import { fetchTeamMembers } from "../../../auth/document-scope";
import type { TeamUser } from "../../../auth/team-users";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import type { CoreActionName } from "../../../core/actions";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import { flattenFoldersForSelect } from "../../folder-tree";
import { BindingsSection } from "./scope/bindings-section";
import { FoldersSection } from "./scope/folders-section";
import type { ScopeAdminLabels } from "./scope/labels";
import { MembershipSection } from "./scope/membership-section";
import { TeamsSection } from "./scope/teams-section";

export function ScopeAdminForm({ props }: ComponentCtx<ScopeAdminLabels>) {
  const labels = props;
  const canManageScope = useAdminRouteAccess("scope");
  const catalog = useCatalogSubmit();
  const { submit, run, executeAction, pending, error, success, reset } = catalog;

  const collections =
    (useStateValue(ADMIN_STATE.scope.collections) as ScopeCatalogEntry[] | undefined) ?? [];
  const uniqueCollections = useMemo(() => {
    const bySlug = new Map<string, ScopeCatalogEntry>();
    for (const entry of collections) {
      if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
    }
    return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [collections]);
  const teams = (useStateValue(ADMIN_STATE.scope.teams) as ScopeCatalogEntry[] | undefined) ?? [];
  const bindings =
    (useStateValue(ADMIN_STATE.scope.bindings) as CollectionTeamBinding[] | undefined) ?? [];
  const agentBindings =
    (useStateValue(ADMIN_STATE.scope.agentBindings) as CollectionAgentBinding[] | undefined) ?? [];
  const users = (useStateValue(ADMIN_STATE.team.users) as TeamUser[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.scope.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.scope.error) as string | null | undefined;

  const [collection, setCollection] = useState("marketing");
  const [team, setTeam] = useState("marketing-team");
  const [newFolderSlug, setNewFolderSlug] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState("");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [publisherSlot, setPublisherSlot] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMemberEntry[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const reloadTeamMembers = useCallback(async (teamSlug: string) => {
    if (!teamSlug.trim()) {
      setTeamMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      setTeamMembers(await fetchTeamMembers(teamSlug.trim()));
    } catch {
      setTeamMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadTeamMembers(team);
    setSelectedUserIds([]);
  }, [team, reloadTeamMembers]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.userId, user])), [users]);

  function toggleSelectedUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function clearSelectedUsers() {
    setSelectedUserIds([]);
  }

  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      return (
        user.email.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
      );
    });
  }, [users, memberSearch]);

  const folderOptions = flattenFoldersForSelect(
    uniqueCollections
      .filter((entry): entry is ScopeCatalogEntry & { id: string } => Boolean(entry.id))
      .map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        label: entry.label,
        parentId: entry.parentId ?? null,
      })),
  );

  async function handleCreateFolder() {
    reset();
    const slug = newFolderSlug.trim();
    if (!slug) return;
    await submit({
      action: "createScopeCollection",
      params: {
        slug,
        label: slug,
        parentId: newFolderParentId.trim() ? newFolderParentId.trim() : null,
      },
      successMessage: labels.grantSuccessMessage,
    });
    setNewFolderSlug("");
    setNewFolderParentId("");
    setCollection(slug);
  }

  async function handleCreateTeam() {
    reset();
    const slug = newTeamSlug.trim();
    if (!slug) return;
    await submit({
      action: "createScopeTeam",
      params: { slug, label: slug },
      successMessage: labels.grantSuccessMessage,
    });
    setNewTeamSlug("");
    setTeam(slug);
  }

  async function handleToggleAccess(
    kind: "editors" | "publishers",
    enabled: boolean,
    collectionSlug: string,
    teamSlug: string,
  ) {
    reset();
    let action: CoreActionName;
    if (kind === "editors") {
      action = enabled ? "bindCollectionTeamEditors" : "unbindCollectionTeamEditors";
    } else {
      action = enabled ? "bindCollectionTeamPublishers" : "unbindCollectionTeamPublishers";
    }
    await submit({
      action,
      params: { collection: collectionSlug.trim(), team: teamSlug.trim() },
      successMessage: labels.grantSuccessMessage,
    });
  }

  function accessFor(collectionSlug: string, teamSlug: string) {
    const binding = bindings.find(
      (entry) => entry.collection === collectionSlug && entry.team === teamSlug,
    );
    return { editors: binding?.editors ?? false, publishers: binding?.publishers ?? false };
  }

  const selectedAccess = accessFor(collection.trim(), team.trim());

  async function handleDeleteFolder(slug: string) {
    if (!window.confirm(labels.deleteFolderConfirm)) return;
    reset();
    await submit({
      action: "deleteScopeCollection",
      params: { slug },
      successMessage: labels.deleteSuccessMessage,
    });
  }

  async function handleDeleteTeam(slug: string) {
    if (!window.confirm(labels.deleteTeamConfirm)) return;
    reset();
    await submit({
      action: "deleteScopeTeam",
      params: { slug },
      successMessage: labels.deleteSuccessMessage,
    });
  }

  function handleUnbindAgent(binding: CollectionAgentBinding) {
    reset();
    void submit({
      action: "unbindCollectionAgentEditors",
      params: {
        collection: binding.collection,
        agent: binding.agent,
      },
      successMessage: labels.revokeSuccessMessage,
    });
  }

  async function handleRevokeMember(userIdToRevoke: string, slot: "editors" | "publishers") {
    reset();
    await submit({
      action: slot === "editors" ? "revokeTeamEditor" : "revokeTeamPublisher",
      params: { team: team.trim(), userId: userIdToRevoke },
      successMessage: labels.revokeSuccessMessage,
    });
  }

  const grantButtonLabel =
    selectedUserIds.length === 1
      ? labels.grantOnePersonLabel
      : labels.grantManyPeopleLabel.replace("{count}", String(selectedUserIds.length));

  async function handleGrant() {
    const ids = selectedUserIds;
    if (ids.length === 0 || !team.trim()) return;
    reset();
    const action = publisherSlot ? "grantTeamPublisher" : "grantTeamEditor";
    await run(
      async () => {
        for (const userId of ids) {
          await executeAction(action, { team: team.trim(), userId });
        }
      },
      {
        successMessage: labels.grantSuccessMessage,
        onSuccess: () => {
          setSelectedUserIds([]);
          setMemberSearch("");
          void reloadTeamMembers(team.trim());
        },
      },
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  if (canManageScope === null) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (canManageScope === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{labels.forbiddenLabel}</AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">{labels.helpText}</p>

      <FoldersSection
        labels={labels}
        pending={pending}
        uniqueCollections={uniqueCollections}
        folderOptions={folderOptions}
        newFolderSlug={newFolderSlug}
        onNewFolderSlugChange={setNewFolderSlug}
        newFolderParentId={newFolderParentId}
        onNewFolderParentIdChange={setNewFolderParentId}
        onCreateFolder={() => void handleCreateFolder()}
        onDeleteFolder={(slug) => void handleDeleteFolder(slug)}
      />

      <TeamsSection
        labels={labels}
        pending={pending}
        teams={teams}
        newTeamSlug={newTeamSlug}
        onNewTeamSlugChange={setNewTeamSlug}
        onCreateTeam={() => void handleCreateTeam()}
        onDeleteTeam={(slug) => void handleDeleteTeam(slug)}
      />

      <BindingsSection
        labels={labels}
        pending={pending}
        bindings={bindings}
        agentBindings={agentBindings}
        uniqueCollections={uniqueCollections}
        teams={teams}
        collection={collection}
        onCollectionChange={setCollection}
        team={team}
        onTeamChange={setTeam}
        selectedAccess={selectedAccess}
        onToggleAccess={(kind, enabled, collectionSlug, teamSlug) =>
          void handleToggleAccess(kind, enabled, collectionSlug, teamSlug)
        }
        onUnbindAgent={handleUnbindAgent}
      />

      <MembershipSection
        labels={labels}
        pending={pending}
        teams={teams}
        team={team}
        onTeamChange={setTeam}
        membersLoading={membersLoading}
        teamMembers={teamMembers}
        usersById={usersById}
        filteredUsers={filteredUsers}
        memberSearch={memberSearch}
        onMemberSearchChange={setMemberSearch}
        selectedUserIds={selectedUserIds}
        onToggleUser={toggleSelectedUser}
        onClearSelection={clearSelectedUsers}
        publisherSlot={publisherSlot}
        onPublisherSlotChange={setPublisherSlot}
        onRevokeMember={(userId, slot) => void handleRevokeMember(userId, slot)}
        onGrant={() => void handleGrant()}
        grantButtonLabel={grantButtonLabel}
      />

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
