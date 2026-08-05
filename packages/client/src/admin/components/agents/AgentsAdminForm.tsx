import { useActions, useStateValue } from "@json-render/react";
import { useEffect, useMemo, useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type {
  AgentArtifact,
  AgentStepRecord,
  AgentTask,
  OrchestrateOutput,
  RegisteredAgent,
} from "../../../auth/agents";
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
  createTaskSectionTitle: string;
  createTaskSectionDescription: string;
  taskPromptLabel: string;
  taskAgentLabel: string;
  createTaskLabel: string;
  creatingTaskLabel: string;
  createTaskSuccessMessage: string;
  viewTaskLabel: string;
  stepsSectionTitle: string;
  artifactsSectionTitle: string;
  runSummaryLabel: string;
  noArtifactsMessage: string;
  stepStatusOkLabel: string;
  stepStatusDeniedLabel: string;
  stepStatusErrorLabel: string;
  runningTaskLabel: string;
};

function parseOrchestrateOutput(output: Record<string, unknown> | null): OrchestrateOutput | null {
  if (!output || typeof output !== "object") return null;
  const summary = typeof output.summary === "string" ? output.summary : "";
  const steps = Array.isArray(output.steps)
    ? (output.steps as AgentStepRecord[])
    : [];
  const artifacts = Array.isArray(output.artifacts)
    ? (output.artifacts as AgentArtifact[])
    : [];
  const stoppedReason =
    output.stoppedReason === "max_steps" ||
    output.stoppedReason === "error" ||
    output.stoppedReason === "denied"
      ? output.stoppedReason
      : "completed";
  if (!summary && steps.length === 0 && artifacts.length === 0) return null;
  return { summary, steps, artifacts, stoppedReason };
}

function artifactHref(artifact: AgentArtifact): string | null {
  if (artifact.kind === "layout") return `/admin/layout/${encodeURIComponent(artifact.label)}`;
  if (artifact.kind === "content") return `/admin/content/${encodeURIComponent(artifact.label)}`;
  return null;
}

function stepStatusLabel(
  status: AgentStepRecord["status"],
  labels: AgentsAdminLabels,
): string {
  if (status === "denied") return labels.stepStatusDeniedLabel;
  if (status === "error") return labels.stepStatusErrorLabel;
  return labels.stepStatusOkLabel;
}

export function AgentsAdminForm({
  props,
}: ComponentCtx<CatalogProps<Record<string, never>, AgentsAdminLabels>>) {
  const { labels } = props;
  const canAccess = useAdminRouteAccess("agents");
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, reset } = catalog;
  const { execute } = useActions();

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
  const selectedTaskId = useStateValue(ADMIN_STATE.agents.selectedTaskId) as string | null | undefined;
  const selectedTaskDetail = useStateValue(ADMIN_STATE.agents.selectedTaskDetail) as
    | AgentTask
    | null
    | undefined;

  const [session, setSession] = useState<AuthSessionStatus | null>(null);
  const [folders, setFolders] = useState<ScopeCatalogEntry[]>([]);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [folderSlug, setFolderSlug] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskAgentId, setTaskAgentId] = useState("");

  const canManageAllTasks = sessionHasPermission(session, PERMISSIONS.AGENT_MANAGE);
  const ownedAgentIds = useMemo(
    () =>
      new Set(
        registry.filter((agent) => agent.ownerUserId === session?.userId).map((agent) => agent.id),
      ),
    [registry, session?.userId],
  );
  const canSeeTasks = canManageAllTasks || ownedAgentIds.size > 0;
  const canCreateTask = canManageAllTasks || ownedAgentIds.size > 0;
  const creatableAgents = useMemo(
    () =>
      canManageAllTasks
        ? registry
        : registry.filter((agent) => ownedAgentIds.has(agent.id)),
    [canManageAllTasks, registry, ownedAgentIds],
  );
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
  const orchestrateOutput = useMemo(
    () =>
      selectedTaskDetail?.type === "orchestrate"
        ? parseOrchestrateOutput(selectedTaskDetail.output)
        : null,
    [selectedTaskDetail],
  );

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

  useEffect(() => {
    if (creatableAgents.length > 0 && !taskAgentId) {
      setTaskAgentId(creatableAgents[0]!.id);
    }
  }, [creatableAgents, taskAgentId]);

  useEffect(() => {
    const status = selectedTaskDetail?.status;
    if (!selectedTaskId || (status !== "pending" && status !== "running")) return;
    const timer = window.setInterval(() => {
      void execute({ action: "loadAgentTaskDetail", params: { taskId: selectedTaskId } });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [execute, selectedTaskDetail?.status, selectedTaskId]);

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
      cell: (row) => (
        <Badge variant={row.status === "running" ? "default" : "secondary"}>{row.status}</Badge>
      ),
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
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedTaskId === row.id ? "default" : "outline"}
            disabled={pending}
            onClick={() => {
              void execute({ action: "selectAgentTask", params: { taskId: row.id } });
            }}
          >
            {labels.viewTaskLabel}
          </Button>
          {row.status === "completed" && canReviewTask(row) ? (
            <>
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
            </>
          ) : null}
        </div>
      ),
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
        <CardContent className="space-y-6">
          {!canSeeTasks ? (
            <Alert>
              <AlertDescription>{labels.tasksForbiddenLabel}</AlertDescription>
            </Alert>
          ) : (
            <>
              {canCreateTask && creatableAgents.length > 0 ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h3 className="font-medium">{labels.createTaskSectionTitle}</h3>
                    <p className="text-sm text-muted-foreground">
                      {labels.createTaskSectionDescription}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="task-prompt">{labels.taskPromptLabel}</Label>
                      <Input
                        id="task-prompt"
                        value={taskPrompt}
                        onChange={(e) => setTaskPrompt(e.target.value)}
                        placeholder="Summarize last week's signups and draft a hero layout"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-agent">{labels.taskAgentLabel}</Label>
                      <select
                        id="task-agent"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={taskAgentId}
                        onChange={(e) => setTaskAgentId(e.target.value)}
                      >
                        {creatableAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.label} ({agent.slug})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={pending || !taskPrompt.trim() || !taskAgentId}
                    onClick={() => {
                      reset();
                      void submit({
                        action: "createAgentTask",
                        params: {
                          prompt: taskPrompt.trim(),
                          registeredAgentId: taskAgentId,
                          type: "orchestrate",
                        },
                        successMessage: labels.createTaskSuccessMessage,
                        onSuccess: () => setTaskPrompt(""),
                      });
                    }}
                  >
                    {pending ? labels.creatingTaskLabel : labels.createTaskLabel}
                  </Button>
                </div>
              ) : null}

              <DataTable
                columns={taskColumns}
                rows={tasks}
                rowKey={(row) => row.id}
                emptyMessage={labels.emptyTasksMessage}
              />

              {selectedTaskDetail ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{selectedTaskDetail.type}</h3>
                      <p className="text-sm text-muted-foreground">{selectedTaskDetail.prompt}</p>
                    </div>
                    <Badge>{selectedTaskDetail.status}</Badge>
                  </div>

                  {selectedTaskDetail.status === "pending" ||
                  selectedTaskDetail.status === "running" ? (
                    <p className="text-sm text-muted-foreground">{labels.runningTaskLabel}</p>
                  ) : null}

                  {selectedTaskDetail.error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{selectedTaskDetail.error}</AlertDescription>
                    </Alert>
                  ) : null}

                  {orchestrateOutput ? (
                    <>
                      {orchestrateOutput.summary ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{labels.runSummaryLabel}</p>
                          <p className="text-sm text-muted-foreground">{orchestrateOutput.summary}</p>
                        </div>
                      ) : null}

                      {orchestrateOutput.steps.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">{labels.stepsSectionTitle}</p>
                          <ol className="space-y-2">
                            {orchestrateOutput.steps.map((step) => (
                              <li
                                key={`${step.index}-${step.tool}`}
                                className="rounded-md border px-3 py-2 text-sm"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs">{step.tool}</span>
                                  <Badge variant="outline">
                                    {stepStatusLabel(step.status, labels)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {step.durationMs}ms
                                  </span>
                                </div>
                                {step.outputSummary ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {step.outputSummary}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-sm font-medium">{labels.artifactsSectionTitle}</p>
                        {orchestrateOutput.artifacts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">{labels.noArtifactsMessage}</p>
                        ) : (
                          <ul className="space-y-1">
                            {orchestrateOutput.artifacts.map((artifact) => {
                              const href = artifactHref(artifact);
                              return (
                                <li key={`${artifact.kind}-${artifact.documentId ?? artifact.label}`}>
                                  {href ? (
                                    <a
                                      href={href}
                                      className="text-sm text-primary underline-offset-4 hover:underline"
                                    >
                                      {artifact.kind}: {artifact.label}
                                    </a>
                                  ) : (
                                    <span className="text-sm">
                                      {artifact.kind}: {artifact.label}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void execute({ action: "selectAgentTask", params: { taskId: null } })}
                  >
                    Close
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
