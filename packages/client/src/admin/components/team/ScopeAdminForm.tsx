import { useStateValue } from "@json-render/react";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type { ScopeCatalogEntry } from "../../../auth/document-scope";
import type { TeamUser } from "../../../auth/team-users";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";

type ScopeAdminConfig = Record<string, never>;

type ScopeAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  tagLabel: string;
  tagPlaceholder: string;
  teamLabel: string;
  teamPlaceholder: string;
  createTagLabel: string;
  creatingTagLabel: string;
  createTeamLabel: string;
  creatingTeamLabel: string;
  bindEditorsLabel: string;
  bindPublishersLabel: string;
  unbindEditorsLabel: string;
  unbindPublishersLabel: string;
  bindingLabel: string;
  deleteTagLabel: string;
  deleteTeamLabel: string;
  deletingLabel: string;
  deleteSuccessMessage: string;
  userLabel: string;
  slotEditorLabel: string;
  slotPublisherLabel: string;
  grantLabel: string;
  grantingLabel: string;
  revokeLabel: string;
  revokingLabel: string;
  grantSuccessMessage: string;
  revokeSuccessMessage: string;
  bindSuccessMessage: string;
  knownTagsLabel: string;
  emptyTagsMessage: string;
  knownTeamsLabel: string;
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
  const { submit, pending, error, success, reset } = catalog;

  const tags = (useStateValue(ADMIN_STATE.scope.tags) as ScopeCatalogEntry[] | undefined) ?? [];
  const teams = (useStateValue(ADMIN_STATE.scope.teams) as ScopeCatalogEntry[] | undefined) ?? [];
  const users = (useStateValue(ADMIN_STATE.team.users) as TeamUser[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.scope.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.scope.error) as string | null | undefined;

  const [tag, setTag] = useState("marketing");
  const [team, setTeam] = useState("marketing-team");
  const [newTagSlug, setNewTagSlug] = useState("");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [userId, setUserId] = useState("");
  const [publisherSlot, setPublisherSlot] = useState(false);

  async function handleCreateTag() {
    reset();
    const slug = newTagSlug.trim();
    if (!slug) return;
    await submit({
      action: "createScopeTag",
      params: { slug, label: slug },
      successMessage: labels.grantSuccessMessage,
    });
    setNewTagSlug("");
    setTag(slug);
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

  async function handleBindEditors() {
    reset();
    await submit({
      action: "bindTagTeamEditors",
      params: { tag: tag.trim(), team: team.trim() },
      successMessage: labels.bindSuccessMessage,
    });
  }

  async function handleBindPublishers() {
    reset();
    await submit({
      action: "bindTagTeamPublishers",
      params: { tag: tag.trim(), team: team.trim() },
      successMessage: labels.bindSuccessMessage,
    });
  }

  async function handleUnbindEditors() {
    reset();
    await submit({
      action: "unbindTagTeamEditors",
      params: { tag: tag.trim(), team: team.trim() },
      successMessage: labels.revokeSuccessMessage,
    });
  }

  async function handleUnbindPublishers() {
    reset();
    await submit({
      action: "unbindTagTeamPublishers",
      params: { tag: tag.trim(), team: team.trim() },
      successMessage: labels.revokeSuccessMessage,
    });
  }

  async function handleDeleteTag(slug: string) {
    reset();
    await submit({
      action: "deleteScopeTag",
      params: { slug },
      successMessage: labels.deleteSuccessMessage,
    });
  }

  async function handleDeleteTeam(slug: string) {
    reset();
    await submit({
      action: "deleteScopeTeam",
      params: { slug },
      successMessage: labels.deleteSuccessMessage,
    });
  }

  async function handleGrant() {
    reset();
    await submit({
      action: publisherSlot ? "grantTeamPublisher" : "grantTeamEditor",
      params: { team: team.trim(), userId },
      successMessage: labels.grantSuccessMessage,
    });
  }

  async function handleRevoke() {
    reset();
    await submit({
      action: publisherSlot ? "revokeTeamPublisher" : "revokeTeamEditor",
      params: { team: team.trim(), userId },
      successMessage: labels.revokeSuccessMessage,
    });
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
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm text-muted-foreground">{labels.helpText}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope-new-tag">{labels.tagLabel}</Label>
              <div className="flex gap-2">
                <Input
                  id="scope-new-tag"
                  value={newTagSlug}
                  onChange={(e) => setNewTagSlug(e.target.value)}
                  placeholder={labels.tagPlaceholder}
                />
                <Button
                  type="button"
                  disabled={pending || !newTagSlug.trim()}
                  onClick={() => void handleCreateTag()}
                >
                  {pending ? labels.creatingTagLabel : labels.createTagLabel}
                </Button>
              </div>
            </div>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.knownTagsLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope-tag">{labels.tagLabel}</Label>
              <Input
                id="scope-tag"
                list="scope-tag-suggestions"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder={labels.tagPlaceholder}
              />
              <datalist id="scope-tag-suggestions">
                {tags.map((entry) => (
                  <option key={entry.slug} value={entry.slug} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope-team">{labels.teamLabel}</Label>
              <Input
                id="scope-team"
                list="scope-team-suggestions"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder={labels.teamPlaceholder}
              />
              <datalist id="scope-team-suggestions">
                {teams.map((entry) => (
                  <option key={entry.slug} value={entry.slug} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || !tag.trim() || !team.trim()}
              onClick={() => void handleBindEditors()}
            >
              {pending ? labels.bindingLabel : labels.bindEditorsLabel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !tag.trim() || !team.trim()}
              onClick={() => void handleBindPublishers()}
            >
              {pending ? labels.bindingLabel : labels.bindPublishersLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !tag.trim() || !team.trim()}
              onClick={() => void handleUnbindEditors()}
            >
              {pending ? labels.bindingLabel : labels.unbindEditorsLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !tag.trim() || !team.trim()}
              onClick={() => void handleUnbindPublishers()}
            >
              {pending ? labels.bindingLabel : labels.unbindPublishersLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.knownTeamsLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scope-user">{labels.userLabel}</Label>
            <select
              id="scope-user"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select team member…</option>
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.email} ({user.role})
                </option>
              ))}
            </select>
          </div>
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
              disabled={pending || !team.trim() || !userId}
              onClick={() => void handleGrant()}
            >
              {pending ? labels.grantingLabel : labels.grantLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !team.trim() || !userId}
              onClick={() => void handleRevoke()}
            >
              {pending ? labels.revokingLabel : labels.revokeLabel}
            </Button>
          </div>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyTagsMessage}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {tags.map((entry) => (
                <li key={entry.slug} className="flex items-center justify-between gap-2">
                  <span>
                    {entry.label} ({entry.slug})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void handleDeleteTag(entry.slug)}
                  >
                    {pending ? labels.deletingLabel : labels.deleteTagLabel}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.emptyTeamsMessage}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {teams.map((entry) => (
                <li key={entry.slug} className="flex items-center justify-between gap-2">
                  <span>
                    {entry.label} ({entry.slug})
                  </span>
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
