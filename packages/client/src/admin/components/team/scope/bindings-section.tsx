import type {
  CollectionAgentBinding,
  CollectionTeamBinding,
  ScopeCatalogEntry,
} from "../../../../auth/document-scope";
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
import { AccessToggle } from "./access-toggle";
import type { ScopeAdminLabels } from "./labels";

export function BindingsSection({
  labels,
  pending,
  bindings,
  agentBindings,
  uniqueCollections,
  teams,
  collection,
  onCollectionChange,
  team,
  onTeamChange,
  selectedAccess,
  onToggleAccess,
  onUnbindAgent,
}: Readonly<{
  labels: ScopeAdminLabels;
  pending: boolean;
  bindings: CollectionTeamBinding[];
  agentBindings: CollectionAgentBinding[];
  uniqueCollections: ScopeCatalogEntry[];
  teams: ScopeCatalogEntry[];
  collection: string;
  onCollectionChange: (value: string) => void;
  team: string;
  onTeamChange: (value: string) => void;
  selectedAccess: { editors: boolean; publishers: boolean };
  onToggleAccess: (
    kind: "editors" | "publishers",
    enabled: boolean,
    collectionSlug: string,
    teamSlug: string,
  ) => void;
  onUnbindAgent: (binding: CollectionAgentBinding) => void;
}>) {
  return (
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
                  const rowAccess = {
                    editors: binding.editors,
                    publishers: binding.publishers,
                  };
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
                            onToggleAccess("editors", enabled, binding.collection, binding.team)
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
                            onToggleAccess("publishers", enabled, binding.collection, binding.team)
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
                        onClick={() => onUnbindAgent(binding)}
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
              onChange={(e) => onCollectionChange(e.target.value)}
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
            onToggle={(enabled) => onToggleAccess("editors", enabled, collection, team)}
          />
          <AccessToggle
            label={labels.publishAccessLabel}
            enabled={selectedAccess.publishers}
            pending={pending}
            onLabel={labels.accessOnLabel}
            offLabel={labels.accessOffLabel}
            savingLabel={labels.bindingLabel}
            disabled={!collection.trim() || !team.trim()}
            onToggle={(enabled) => onToggleAccess("publishers", enabled, collection, team)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
