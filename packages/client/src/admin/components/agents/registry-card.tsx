import type { RegisteredAgent } from "../../../auth/agents";
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
import type { CatalogSubmit } from "../../../core/use-catalog-submit";
import type { FolderCatalogEntry, FolderSelectOption } from "../../folder-tree";
import { indentFolderLabel } from "../../folder-tree";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import type { AgentsAdminLabels } from "./agents-admin-labels";

type RegistryCardProps = {
  labels: AgentsAdminLabels;
  registry: RegisteredAgent[];
  catalog: CatalogSubmit;
  slug: string;
  setSlug: (value: string) => void;
  label: string;
  setLabel: (value: string) => void;
  selectedAgentId: string;
  setSelectedAgentId: (value: string) => void;
  folderSlug: string;
  setFolderSlug: (value: string) => void;
  folderCatalog: FolderCatalogEntry[];
  folderOptions: FolderSelectOption[];
};

export function RegistryCard({
  labels,
  registry,
  catalog,
  slug,
  setSlug,
  label,
  setLabel,
  selectedAgentId,
  setSelectedAgentId,
  folderSlug,
  setFolderSlug,
  folderCatalog,
  folderOptions,
}: RegistryCardProps) {
  const { submit, pending, reset } = catalog;

  const registryColumns: DataTableColumn<RegisteredAgent>[] = [
    { key: "slug", header: labels.slugColumnHeader, cell: (row) => row.slug },
    { key: "label", header: labels.labelColumnHeader, cell: (row) => row.label },
    {
      key: "owner",
      header: labels.ownerColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.ownerUserId}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              reset();
              void submit({
                action: "mintAgentToken",
                params: { agentId: row.id },
                successMessage: labels.mintSuccessMessage,
              });
            }}
          >
            {labels.mintTokenLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(labels.deleteConfirm.replace("{slug}", row.slug))) return;
              reset();
              void submit({
                action: "deleteRegisteredAgent",
                params: { agentId: row.id },
                successMessage: labels.deleteSuccessMessage,
              });
            }}
          >
            {labels.deleteLabel}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.registrySectionTitle}</CardTitle>
        <CardDescription>{labels.registrySectionDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-slug">{labels.slugLabel}</Label>
            <Input
              id="agent-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="copy-assistant"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-label">{labels.labelLabel}</Label>
            <Input
              id="agent-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Copy assistant"
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={pending || !slug.trim()}
          onClick={() => {
            reset();
            void submit({
              action: "registerAgent",
              params: { slug: slug.trim(), label: label.trim() || undefined },
              successMessage: labels.registerSuccessMessage,
              onSuccess: () => {
                setSlug("");
                setLabel("");
              },
            });
          }}
        >
          {pending ? labels.registeringLabel : labels.registerLabel}
        </Button>

        <DataTable
          columns={registryColumns}
          rows={registry}
          rowKey={(row) => row.id}
          emptyMessage={labels.emptyRegistryMessage}
        />

        {registry.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-picker">{labels.grantFolderLabel}</Label>
              <select
                id="agent-picker"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
              >
                {registry.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label} ({agent.slug})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-picker">{labels.folderSelectLabel}</Label>
              <select
                id="folder-picker"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={folderSlug}
                onChange={(e) => setFolderSlug(e.target.value)}
              >
                <option value="">—</option>
                {folderCatalog.map((folder) => {
                  const depth = folderOptions.find((opt) => opt.id === folder.id)?.depth ?? 0;
                  return (
                    <option key={folder.id} value={folder.slug}>
                      {indentFolderLabel(folder.label, depth)}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        ) : null}
        {selectedAgentId && folderSlug ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              reset();
              void submit({
                action: "grantAgentCollectionEditor",
                params: { agentId: selectedAgentId, collectionSlug: folderSlug },
                successMessage: labels.grantFolderSuccessMessage,
              });
            }}
          >
            {labels.grantFolderLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
