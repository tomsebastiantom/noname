import { useActions, useStateValue } from "@json-render/react";
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
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import { flattenFoldersForSelect } from "../../folder-tree";
import { DataTable } from "../shared/DataTable";
import type { AgentsAdminLabels } from "./agents-admin-labels";
import { CreateTaskForm } from "./create-task-form";
import { parseOrchestrateOutput } from "./orchestrate-output";
import { RegistryCard } from "./registry-card";
import { taskColumns } from "./task-columns";
import { TaskDetail } from "./task-detail";

export function AgentsAdminForm({ props }: ComponentCtx<AgentsAdminLabels>) {
  const labels = props;
  const canAccess = useAdminRouteAccess("agents");
  const catalog = useCatalogSubmit();
  const { submit, error, success } = catalog;
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
  const selectedTaskId = useStateValue(ADMIN_STATE.agents.selectedTaskId) as
    | string
    | null
    | undefined;
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
    () => (canManageAllTasks ? registry : registry.filter((agent) => ownedAgentIds.has(agent.id))),
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
  const columns = taskColumns({
    labels,
    catalog,
    selectedTaskId,
    execute,
    canReviewTask,
  });

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

      <RegistryCard
        labels={labels}
        registry={registry}
        catalog={catalog}
        slug={slug}
        setSlug={setSlug}
        label={label}
        setLabel={setLabel}
        selectedAgentId={selectedAgentId}
        setSelectedAgentId={setSelectedAgentId}
        folderSlug={folderSlug}
        setFolderSlug={setFolderSlug}
        folderCatalog={folderCatalog}
        folderOptions={folderOptions}
      />

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
                <CreateTaskForm
                  labels={labels}
                  catalog={catalog}
                  creatableAgents={creatableAgents}
                  taskPrompt={taskPrompt}
                  setTaskPrompt={setTaskPrompt}
                  taskAgentId={taskAgentId}
                  setTaskAgentId={setTaskAgentId}
                />
              ) : null}

              <DataTable
                columns={columns}
                rows={tasks}
                rowKey={(row) => row.id}
                emptyMessage={labels.emptyTasksMessage}
              />

              {selectedTaskDetail ? (
                <TaskDetail
                  labels={labels}
                  selectedTaskDetail={selectedTaskDetail}
                  orchestrateOutput={orchestrateOutput}
                  execute={execute}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
