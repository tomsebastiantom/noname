import { useStateValue } from "@json-render/react";
import { useEffect, useMemo, useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type { AgentTask, RegisteredAgent } from "../../../auth/agents";
import { fetchScopeCollections, type ScopeCatalogEntry } from "../../../auth/document-scope";
import {
  type AuthSessionStatus,
  fetchAuthSessionStatus,
  PERMISSIONS,
  sessionHasPermission,
} from "../../../auth/team-users";
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
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { flattenFoldersForSelect, indentFolderLabel } from "../../folder-tree";
import { DataTable, type DataTableColumn } from "../shared/DataTable";

type AgentsAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  registrySectionTitle: string;
  registrySectionDescription: string;
  slugLabel: string;
  labelLabel: string;
  registerLabel: string;
  registeringLabel: string;
  registerSuccessMessage: string;
  deleteLabel: string;
  deleteConfirm: string;
  deleteSuccessMessage: string;
  mintTokenLabel: string;
  mintingLabel: string;
  mintSuccessMessage: string;
  tokenExpiresLabel: string;
  grantFolderLabel: string;
  grantFolderSuccessMessage: string;
  folderSelectLabel: string;
  emptyRegistryMessage: string;
  tasksSectionTitle: string;
  tasksSectionDescription: string;
  emptyTasksMessage: string;
  approveLabel: string;
  rejectLabel: string;
  taskApprovedMessage: string;
  taskRejectedMessage: string;
  slugColumnHeader: string;
  labelColumnHeader: string;
  ownerColumnHeader: string;
  statusColumnHeader: string;
  typeColumnHeader: string;
  promptColumnHeader: string;
  reviewedByColumnHeader: string;
  tasksForbiddenLabel: string;
};

export function AgentsAdminForm({
  props,
}: ComponentCtx<CatalogProps<Record<string, never>, AgentsAdminLabels>>) {
  const { labels } = props;
  const canAccess = useAdminRouteAccess("agents");
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, reset } = catalog;

  useMountAction("loadAgentsAdmin", {});

  const registry =
    (useStateValue(ADMIN_STATE.agents.registry) as RegisteredAgent[] | undefined) ?? [];
  const tasks = (useStateValue(ADMIN_STATE.agents.tasks) as AgentTask[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.agents.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.agents.error) as string | null | undefined;
  const mintedToken = useStateValue(ADMIN_STATE.agents.mintedToken) as string | null | undefined;
  const mintedExpires = useStateValue(ADMIN_STATE.agents.mintedTokenExpiresAt) as
    | string
    | null
    | undefined;

  const [session, setSession] = useState<AuthSessionStatus | null>(null);
  const [folders, setFolders] = useState<ScopeCatalogEntry[]>([]);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [folderSlug, setFolderSlug] = useState("");

  const canManageAllTasks = sessionHasPermission(session, PERMISSIONS.AGENT_MANAGE);
  const ownedAgentIds = useMemo(
    () =>
      new Set(
        registry.filter((agent) => agent.ownerUserId === session?.userId).map((agent) => agent.id),
      ),
    [registry, session?.userId],
  );
  const canSeeTasks = canManageAllTasks || ownedAgentIds.size > 0;
  const canReviewTask = (task: AgentTask): boolean =>
    canManageAllTasks ||
    (task.registeredAgentId !== null && ownedAgentIds.has(task.registeredAgentId));
  const folderCatalog = useMemo(
    () =>
      folders
        .filter((entry): entry is ScopeCatalogEntry & { id: string } => Boolean(entry.id))
        .map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          label: entry.label,
          parentId: entry.parentId ?? null,
        })),
    [folders],
  );
  const folderOptions = useMemo(() => flattenFoldersForSelect(folderCatalog), [folderCatalog]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthSessionStatus()
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    void fetchScopeCollections()
      .then((data) => {
        if (!cancelled) setFolders(data);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (registry.length > 0 && !selectedAgentId) {
      setSelectedAgentId(registry[0]!.id);
    }
  }, [registry, selectedAgentId]);

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

  const formatReviewer = (task: AgentTask): string | null => {
    const record = task.approvedBy ?? task.rejectedBy;
    if (!record) return null;
    const when = new Date(record.at).toLocaleString();
    return `${record.actorId} · ${when}`;
  };

  const taskColumns: DataTableColumn<AgentTask>[] = [
    { key: "type", header: labels.typeColumnHeader, cell: (row) => row.type },
    {
      key: "status",
      header: labels.statusColumnHeader,
      cell: (row) => <Badge variant="secondary">{row.status}</Badge>,
    },
    {
      key: "prompt",
      header: labels.promptColumnHeader,
      cell: (row) => <span className="line-clamp-2 max-w-md text-sm">{row.prompt}</span>,
    },
    {
      key: "reviewedBy",
      header: labels.reviewedByColumnHeader,
      cell: (row) => {
        const reviewer = formatReviewer(row);
        return reviewer ? <span className="text-xs text-muted-foreground">{reviewer}</span> : "—";
      },
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        row.status === "completed" && canReviewTask(row) ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                reset();
                void submit({
                  action: "approveAgentTask",
                  params: { taskId: row.id },
                  successMessage: labels.taskApprovedMessage,
                });
              }}
            >
              {labels.approveLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                reset();
                void submit({
                  action: "rejectAgentTask",
                  params: { taskId: row.id },
                  successMessage: labels.taskRejectedMessage,
                });
              }}
            >
              {labels.rejectLabel}
            </Button>
          </div>
        ) : null,
    },
  ];

  if (canAccess === false) {
    return (
      <Alert>
        <AlertDescription>{labels.forbiddenLabel}</AlertDescription>
      </Alert>
    );
  }

  if (canAccess === null || loading) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{mergeCatalogError(error, loadError)}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
      {mintedToken ? (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="font-medium">{labels.mintSuccessMessage}</p>
            <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
              {mintedToken}
            </code>
            {mintedExpires ? (
              <p className="text-xs text-muted-foreground">
                {labels.tokenExpiresLabel}: {new Date(mintedExpires).toLocaleString()}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void submit({ action: "clearMintedAgentToken", params: {} })}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

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

      <Card>
        <CardHeader>
          <CardTitle>{labels.tasksSectionTitle}</CardTitle>
          <CardDescription>{labels.tasksSectionDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!canSeeTasks ? (
            <Alert>
              <AlertDescription>{labels.tasksForbiddenLabel}</AlertDescription>
            </Alert>
          ) : (
            <DataTable
              columns={taskColumns}
              rows={tasks}
              rowKey={(row) => row.id}
              emptyMessage={labels.emptyTasksMessage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
