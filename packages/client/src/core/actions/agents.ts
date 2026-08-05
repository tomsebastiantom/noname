import {
  approveAgentTask,
  createAgentTask,
  deleteRegisteredAgent,
  fetchAgentTaskById,
  fetchAgentTasks,
  fetchRegisteredAgents,
  grantAgentCollectionEditor,
  mintAgentToken,
  registerAgent,
  rejectAgentTask,
} from "../../auth/agents";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

async function refreshAgents(setState: (path: string, value: unknown) => void): Promise<void> {
  const [registry, tasks] = await Promise.all([fetchRegisteredAgents(), fetchAgentTasks()]);
  setState(ADMIN_STATE.agents.registry, registry);
  setState(ADMIN_STATE.agents.tasks, tasks);
}

export const agentActions = {
  loadAgentsAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.agents.loading, true);
    setState(ADMIN_STATE.agents.error, null);
    try {
      await refreshAgents(setState);
    } catch (err) {
      setState(ADMIN_STATE.agents.error, err instanceof Error ? err.message : String(err));
    } finally {
      setState(ADMIN_STATE.agents.loading, false);
    }
  }) satisfies CatalogActionHandler,

  registerAgent: (async (params, setState) => {
    const { slug, label } = params as { slug: string; label?: string };
    await registerAgent({ slug, label });
    await refreshAgents(setState);
  }) satisfies CatalogActionHandler,

  deleteRegisteredAgent: (async (params, setState) => {
    const { agentId } = params as { agentId: string };
    await deleteRegisteredAgent(agentId);
    await refreshAgents(setState);
  }) satisfies CatalogActionHandler,

  mintAgentToken: (async (params, setState) => {
    const { agentId } = params as { agentId: string };
    const minted = await mintAgentToken(agentId);
    setState(ADMIN_STATE.agents.mintedToken, minted.token);
    setState(ADMIN_STATE.agents.mintedTokenExpiresAt, minted.expiresAt);
  }) satisfies CatalogActionHandler,

  grantAgentCollectionEditor: (async (params, _setState) => {
    const { agentId, collectionSlug } = params as { agentId: string; collectionSlug: string };
    await grantAgentCollectionEditor(agentId, collectionSlug);
  }) satisfies CatalogActionHandler,

  approveAgentTask: (async (params, setState) => {
    const { taskId } = params as { taskId: string };
    await approveAgentTask(taskId);
    await refreshAgents(setState);
  }) satisfies CatalogActionHandler,

  rejectAgentTask: (async (params, setState) => {
    const { taskId } = params as { taskId: string };
    await rejectAgentTask(taskId);
    await refreshAgents(setState);
  }) satisfies CatalogActionHandler,

  clearMintedAgentToken: (async (_params, setState) => {
    setState(ADMIN_STATE.agents.mintedToken, null);
    setState(ADMIN_STATE.agents.mintedTokenExpiresAt, null);
  }) satisfies CatalogActionHandler,

  createAgentTask: (async (params, setState) => {
    const { prompt, registeredAgentId, type } = params as {
      prompt: string;
      registeredAgentId: string;
      type?: "orchestrate";
    };
    const task = await createAgentTask({
      type: type ?? "orchestrate",
      prompt: prompt.trim(),
      registeredAgentId,
    });
    setState(ADMIN_STATE.agents.selectedTaskId, task.id);
    setState(ADMIN_STATE.agents.selectedTaskDetail, task);
    await refreshAgents(setState);
  }) satisfies CatalogActionHandler,

  loadAgentTaskDetail: (async (params, setState) => {
    const { taskId } = params as { taskId: string };
    const task = await fetchAgentTaskById(taskId);
    setState(ADMIN_STATE.agents.selectedTaskDetail, task);
    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "approved" ||
      task.status === "rejected"
    ) {
      await refreshAgents(setState);
    }
  }) satisfies CatalogActionHandler,

  selectAgentTask: (async (params, setState) => {
    const { taskId } = params as { taskId: string | null };
    setState(ADMIN_STATE.agents.selectedTaskId, taskId);
    if (!taskId) {
      setState(ADMIN_STATE.agents.selectedTaskDetail, null);
      return;
    }
    const task = await fetchAgentTaskById(taskId);
    setState(ADMIN_STATE.agents.selectedTaskDetail, task);
  }) satisfies CatalogActionHandler,
};
