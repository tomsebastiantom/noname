import type { ScopeCatalogEntry } from "../../../../auth/document-scope";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { formatFolderOptionLabel } from "../../../folder-tree";
import type { ScopeAdminLabels } from "./labels";

export function TeamsSection({
  labels,
  pending,
  teams,
  newTeamSlug,
  onNewTeamSlugChange,
  onCreateTeam,
  onDeleteTeam,
}: Readonly<{
  labels: ScopeAdminLabels;
  pending: boolean;
  teams: ScopeCatalogEntry[];
  newTeamSlug: string;
  onNewTeamSlugChange: (value: string) => void;
  onCreateTeam: () => void;
  onDeleteTeam: (slug: string) => void;
}>) {
  return (
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
              onChange={(e) => onNewTeamSlugChange(e.target.value)}
              placeholder={labels.teamPlaceholder}
            />
            <Button type="button" disabled={pending || !newTeamSlug.trim()} onClick={onCreateTeam}>
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
                  onClick={() => onDeleteTeam(entry.slug)}
                >
                  {pending ? labels.deletingLabel : labels.deleteTeamLabel}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
