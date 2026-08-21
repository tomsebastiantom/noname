import type { ScopeCatalogEntry, TeamMemberEntry } from "../../../../auth/document-scope";
import type { TeamUser } from "../../../../auth/team-users";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Label } from "../../../../components/ui/label";
import { formatFolderOptionLabel } from "../../../folder-tree";
import type { ScopeAdminLabels } from "./labels";
import { PersonSearchPicker } from "./person-search-picker";

export function MembershipSection({
  labels,
  pending,
  teams,
  team,
  onTeamChange,
  membersLoading,
  teamMembers,
  usersById,
  filteredUsers,
  memberSearch,
  onMemberSearchChange,
  selectedUserIds,
  onToggleUser,
  onClearSelection,
  publisherSlot,
  onPublisherSlotChange,
  onRevokeMember,
  onGrant,
  grantButtonLabel,
}: Readonly<{
  labels: ScopeAdminLabels;
  pending: boolean;
  teams: ScopeCatalogEntry[];
  team: string;
  onTeamChange: (value: string) => void;
  membersLoading: boolean;
  teamMembers: TeamMemberEntry[];
  usersById: Map<string, TeamUser>;
  filteredUsers: TeamUser[];
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  selectedUserIds: string[];
  onToggleUser: (userId: string) => void;
  onClearSelection: () => void;
  publisherSlot: boolean;
  onPublisherSlotChange: (value: boolean) => void;
  onRevokeMember: (userId: string, slot: "editors" | "publishers") => void;
  onGrant: () => void;
  grantButtonLabel: string;
}>) {
  return (
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
            onChange={(e) => onTeamChange(e.target.value)}
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
                              onClick={() => onRevokeMember(member.userId, "editors")}
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
                              onClick={() => onRevokeMember(member.userId, "publishers")}
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
          onQueryChange={onMemberSearchChange}
          onToggleUser={onToggleUser}
          onClearSelection={onClearSelection}
        />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope-slot"
              checked={!publisherSlot}
              onChange={() => onPublisherSlotChange(false)}
            />
            {labels.slotEditorLabel}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope-slot"
              checked={publisherSlot}
              onChange={() => onPublisherSlotChange(true)}
            />
            {labels.slotPublisherLabel}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !team.trim() || selectedUserIds.length === 0}
            onClick={onGrant}
          >
            {pending ? labels.grantingLabel : grantButtonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
