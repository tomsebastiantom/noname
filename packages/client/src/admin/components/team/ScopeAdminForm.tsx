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
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import { cn } from "../../../lib/utils";
import type { CatalogProps } from "../../../schemas/shared";
import {
  flattenFoldersForSelect,
  formatFolderOptionLabel,
  indentFolderLabel,
} from "../../folder-tree";

type ScopeAdminConfig = Record<string, never>;

type ScopeAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  folderLabel: string;
  folderPlaceholder: string;
  folderSelectLabel: string;
  teamLabel: string;
  teamPlaceholder: string;
  teamSelectLabel: string;
  createFolderLabel: string;
  creatingFolderLabel: string;
  createTeamLabel: string;
  creatingTeamLabel: string;
  bindingLabel: string;
  editAccessLabel: string;
  publishAccessLabel: string;
  accessOnLabel: string;
  accessOffLabel: string;
  bindingsListTitle: string;
  emptyBindingsMessage: string;
  deleteFolderLabel: string;
  deleteTeamLabel: string;
  deletingLabel: string;
  deleteSuccessMessage: string;
  deleteFolderConfirm: string;
  deleteTeamConfirm: string;
  userLabel: string;
  memberSearchPlaceholder: string;
  noMemberMatchesMessage: string;
  memberNoneSelectedLabel: string;
  memberSelectedLabel: string;
  clearSelectionLabel: string;
  membersListTitle: string;
  emptyMembersMessage: string;
  memberNameColumnHeader: string;
  orgRoleColumnHeader: string;
  onTeamColumnHeader: string;
  slotEditorLabel: string;
  slotPublisherLabel: string;
  removeEditorLabel: string;
  removePublisherLabel: string;
  grantOnePersonLabel: string;
  grantManyPeopleLabel: string;
  grantingLabel: string;
  revokeLabel: string;
  revokingLabel: string;
  grantSuccessMessage: string;
  revokeSuccessMessage: string;
  foldersSectionTitle: string;
  foldersSectionHint: string;
  teamsSectionTitle: string;
  teamsSectionHint: string;
  bindingsSectionTitle: string;
  bindingsSectionHint: string;
  agentLabel: string;
  agentBindingsListTitle: string;
  emptyAgentBindingsMessage: string;
  removeAgentBindingLabel: string;
  membershipSectionTitle: string;
  membershipSectionHint: string;
  emptyFoldersMessage: string;
  emptyTeamsMessage: string;
  helpText: string;
  forbiddenLabel: string;
};

export function ScopeAdminForm({
  props,
}: ComponentCtx<CatalogProps<ScopeAdminConfig, ScopeAdminLabels>>) {
  const { labels } = props;
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
    let action: string;
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

      <Card>
        <CardHeader>
          <CardTitle>{labels.foldersSectionTitle}</CardTitle>
          <CardDescription>{labels.foldersSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scope-new-folder">{labels.folderLabel}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="scope-new-folder"
                value={newFolderSlug}
                onChange={(e) => setNewFolderSlug(e.target.value)}
                placeholder={labels.folderPlaceholder}
              />
              <select
                id="scope-new-folder-parent"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newFolderParentId}
                onChange={(e) => setNewFolderParentId(e.target.value)}
                aria-label="Parent folder"
              >
                <option value="">Top-level folder</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {indentFolderLabel(folder.label, folder.depth)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={pending || !newFolderSlug.trim()}
                onClick={() => void handleCreateFolder()}
              >
                {pending ? labels.creatingFolderLabel : labels.createFolderLabel}
              </Button>
            </div>
          </div>
          {uniqueCollections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyFoldersMessage}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {folderOptions.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2">
                  <span>{indentFolderLabel(entry.label, entry.depth)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const slug = uniqueCollections.find((c) => c.id === entry.id)?.slug;
                      if (slug) void handleDeleteFolder(slug);
                    }}
                  >
                    {pending ? labels.deletingLabel : labels.deleteFolderLabel}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.teamsSectionTitle}</CardTitle>
          <CardDescription>{labels.teamsSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scope-new-team">{labels.teamLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="scope-new-team"
                value={newTeamSlug}
                onChange={(e) => setNewTeamSlug(e.target.value)}
                placeholder={labels.teamPlaceholder}
              />
              <Button
                type="button"
                disabled={pending || !newTeamSlug.trim()}
                onClick={() => void handleCreateTeam()}
              >
                {pending ? labels.creatingTeamLabel : labels.createTeamLabel}
              </Button>
            </div>
          </div>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyTeamsMessage}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {teams.map((entry) => (
                <li key={entry.slug} className="flex items-center justify-between gap-2">
                  <span>{formatFolderOptionLabel(entry.label, entry.slug)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void handleDeleteTeam(entry.slug)}
                  >
                    {pending ? labels.deletingLabel : labels.deleteTeamLabel}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.bindingsSectionTitle}</CardTitle>
          <CardDescription>{labels.bindingsSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {bindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyBindingsMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm font-medium">{labels.bindingsListTitle}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{labels.folderLabel}</th>
                    <th className="pb-2 pr-4 font-medium">{labels.teamLabel}</th>
                    <th className="pb-2 pr-4 font-medium">{labels.editAccessLabel}</th>
                    <th className="pb-2 font-medium">{labels.publishAccessLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((binding) => {
                    const rowAccess = accessFor(binding.collection, binding.team);
                    return (
                      <tr
                        key={`${binding.collection}:${binding.team}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-4">{binding.collection}</td>
                        <td className="py-2 pr-4">{binding.team}</td>
                        <td className="py-2 pr-4">
                          <AccessToggle
                            enabled={rowAccess.editors}
                            pending={pending}
                            onLabel={labels.accessOnLabel}
                            offLabel={labels.accessOffLabel}
                            savingLabel={labels.bindingLabel}
                            disabled={false}
                            onToggle={(enabled) =>
                              void handleToggleAccess(
                                "editors",
                                enabled,
                                binding.collection,
                                binding.team,
                              )
                            }
                          />
                        </td>
                        <td className="py-2">
                          <AccessToggle
                            enabled={rowAccess.publishers}
                            pending={pending}
                            onLabel={labels.accessOnLabel}
                            offLabel={labels.accessOffLabel}
                            savingLabel={labels.bindingLabel}
                            disabled={false}
                            onToggle={(enabled) =>
                              void handleToggleAccess(
                                "publishers",
                                enabled,
                                binding.collection,
                                binding.team,
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {agentBindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyAgentBindingsMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm font-medium">{labels.agentBindingsListTitle}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{labels.folderLabel}</th>
                    <th className="pb-2 pr-4 font-medium">{labels.agentLabel}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {agentBindings.map((binding) => (
                    <tr
                      key={`${binding.collection}:${binding.agent}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-4">{binding.collection}</td>
                      <td className="py-2 pr-4">{binding.agent}</td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            reset();
                            void submit({
                              action: "unbindCollectionAgentEditors",
                              params: {
                                collection: binding.collection,
                                agent: binding.agent,
                              },
                              successMessage: labels.revokeSuccessMessage,
                            });
                          }}
                        >
                          {labels.removeAgentBindingLabel}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope-folder">{labels.folderLabel}</Label>
              <select
                id="scope-folder"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
              >
                <option value="">{labels.folderSelectLabel}</option>
                {uniqueCollections.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {formatFolderOptionLabel(entry.label, entry.slug)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope-team">{labels.teamLabel}</Label>
              <select
                id="scope-team"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">{labels.teamSelectLabel}</option>
                {teams.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {formatFolderOptionLabel(entry.label, entry.slug)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AccessToggle
              label={labels.editAccessLabel}
              enabled={selectedAccess.editors}
              pending={pending}
              onLabel={labels.accessOnLabel}
              offLabel={labels.accessOffLabel}
              savingLabel={labels.bindingLabel}
              disabled={!collection.trim() || !team.trim()}
              onToggle={(enabled) => void handleToggleAccess("editors", enabled, collection, team)}
            />
            <AccessToggle
              label={labels.publishAccessLabel}
              enabled={selectedAccess.publishers}
              pending={pending}
              onLabel={labels.accessOnLabel}
              offLabel={labels.accessOffLabel}
              savingLabel={labels.bindingLabel}
              disabled={!collection.trim() || !team.trim()}
              onToggle={(enabled) =>
                void handleToggleAccess("publishers", enabled, collection, team)
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.membershipSectionTitle}</CardTitle>
          <CardDescription>{labels.membershipSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scope-bind-team">{labels.teamLabel}</Label>
            <select
              id="scope-bind-team"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">{labels.teamSelectLabel}</option>
              {teams.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {formatFolderOptionLabel(entry.label, entry.slug)}
                </option>
              ))}
            </select>
          </div>

          {membersLoading ? (
            <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
          ) : teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyMembersMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm font-medium">{labels.membersListTitle}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{labels.memberNameColumnHeader}</th>
                    <th className="pb-2 pr-4 font-medium">{labels.orgRoleColumnHeader}</th>
                    <th className="pb-2 pr-4 font-medium">{labels.onTeamColumnHeader}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => {
                    const user = usersById.get(member.userId);
                    const slots: string[] = [];
                    if (member.editors) slots.push(labels.editAccessLabel);
                    if (member.publishers) slots.push(labels.publishAccessLabel);
                    return (
                      <tr key={member.userId} className="border-b last:border-0">
                        <td className="py-2 pr-4">{user?.email ?? member.userId}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{user?.role ?? "—"}</td>
                        <td className="py-2 pr-4">{slots.join(", ") || "—"}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {member.editors && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() => void handleRevokeMember(member.userId, "editors")}
                              >
                                {labels.removeEditorLabel}
                              </Button>
                            )}
                            {member.publishers && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() => void handleRevokeMember(member.userId, "publishers")}
                              >
                                {labels.removePublisherLabel}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <PersonSearchPicker
            id="scope-add-person"
            label={labels.userLabel}
            placeholder={labels.memberSearchPlaceholder}
            emptyMessage={labels.noMemberMatchesMessage}
            noneSelectedLabel={labels.memberNoneSelectedLabel}
            selectedLabel={labels.memberSelectedLabel}
            clearSelectionLabel={labels.clearSelectionLabel}
            disabled={!team.trim() || pending}
            users={filteredUsers}
            selectedUserIds={selectedUserIds}
            query={memberSearch}
            onQueryChange={setMemberSearch}
            onToggleUser={toggleSelectedUser}
            onClearSelection={clearSelectedUsers}
          />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope-slot"
                checked={!publisherSlot}
                onChange={() => setPublisherSlot(false)}
              />
              {labels.slotEditorLabel}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope-slot"
                checked={publisherSlot}
                onChange={() => setPublisherSlot(true)}
              />
              {labels.slotPublisherLabel}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || !team.trim() || selectedUserIds.length === 0}
              onClick={() => void handleGrant()}
            >
              {pending ? labels.grantingLabel : grantButtonLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

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

function PersonSearchPicker({
  id,
  label,
  placeholder,
  emptyMessage,
  noneSelectedLabel,
  selectedLabel,
  clearSelectionLabel,
  disabled,
  users,
  selectedUserIds,
  query,
  onQueryChange,
  onToggleUser,
  onClearSelection,
}: {
  id: string;
  label: string;
  placeholder: string;
  emptyMessage: string;
  noneSelectedLabel: string;
  selectedLabel: string;
  clearSelectionLabel: string;
  disabled: boolean;
  users: TeamUser[];
  selectedUserIds: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggleUser: (userId: string) => void;
  onClearSelection: () => void;
}) {
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedCount = selectedUserIds.length;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <div
        className={cn(
          "flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm",
          selectedCount > 0 ? "border-primary/40 bg-primary/5" : "border-input bg-muted/30",
        )}
      >
        {selectedCount > 0 ? (
          <>
            <Badge variant="default" className="w-fit shrink-0">
              {selectedCount} {selectedLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 shrink-0 px-2"
              disabled={disabled}
              onClick={onClearSelection}
            >
              {clearSelectionLabel}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">{noneSelectedLabel}</span>
        )}
      </div>
      <div
        className="max-h-48 overflow-y-auto rounded-md border border-input bg-background"
        aria-label={label}
        role="listbox"
        aria-multiselectable="true"
      >
        {users.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          users.map((user) => {
            const selected = selectedSet.has(user.userId);
            return (
              <button
                key={user.userId}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/80",
                  selected && "bg-primary/10 font-medium ring-1 ring-inset ring-primary/30",
                )}
                onClick={() => onToggleUser(user.userId)}
              >
                <span className="min-w-0 truncate">{formatPersonOption(user)}</span>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-transparent",
                  )}
                  aria-hidden
                >
                  ✓
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatPersonOption(user: TeamUser): string {
  const name = user.displayName.trim();
  if (name && name.toLowerCase() !== user.email.toLowerCase()) {
    return `${name} (${user.email})`;
  }
  return user.email;
}

function AccessToggle({
  label,
  enabled,
  pending,
  onLabel,
  offLabel,
  savingLabel,
  disabled,
  onToggle,
}: {
  label?: string;
  enabled: boolean;
  pending: boolean;
  onLabel: string;
  offLabel: string;
  savingLabel: string;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const stateLabel = enabled ? onLabel : offLabel;
  const text = label ? `${label}: ${stateLabel}` : stateLabel;
  return (
    <Button
      type="button"
      variant={enabled ? "default" : "outline"}
      size="sm"
      disabled={disabled || pending}
      onClick={() => onToggle(!enabled)}
    >
      {pending ? savingLabel : text}
    </Button>
  );
}
