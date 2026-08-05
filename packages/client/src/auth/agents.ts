import { apiFetchData, apiFetchVoid } from "../lib/api";

export interface RegisteredAgent {
  id: string;
  orgId: string;
  slug: string;
  label: string;
  ownerUserId: string;
  allowedTools: string[];
  createdAt: string;
}

export type AgentTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "approved"
  | "rejected";

export type AgentTaskType =
  | "generate_layout"
  | "generate_content"
  | "generate_machine"
  | "analyze_analytics"
  | "orchestrate";

export interface AgentStepRecord {
  index: number;
  tool: string;
  status: "ok" | "denied" | "error";
  startedAt: string;
  durationMs: number;
  inputSummary?: string;
  outputSummary?: string;
  documentIds?: string[];
}

export interface AgentArtifact {
  kind: "layout" | "content" | "insight" | "machine";
  documentId?: string;
  label: string;
}

export interface OrchestrateOutput {
  summary: string;
  steps: AgentStepRecord[];
  artifacts: AgentArtifact[];
  stoppedReason: "completed" | "max_steps" | "error" | "denied";
}

export interface TaskAuditRecord {
  actorType: string;
  actorId: string;
  onBehalfOf: string | null;
  at: string;
}

export interface AgentTask {
  id: string;
  orgId: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  prompt: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  model: string | null;
  tokens: number | null;
  registeredAgentId: string | null;
  createdBy: TaskAuditRecord | null;
  approvedBy: TaskAuditRecord | null;
  rejectedBy: TaskAuditRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface MintedAgentToken {
  token: string;
  expiresAt: string;
  permissions: string[];
}

export async function fetchRegisteredAgents(): Promise<RegisteredAgent[]> {
  return apiFetchData<RegisteredAgent[]>("/api/agents/registry");
}

export async function registerAgent(input: {
  slug: string;
  label?: string;
}): Promise<RegisteredAgent> {
  return apiFetchData<RegisteredAgent>("/api/agents/registry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteRegisteredAgent(agentId: string): Promise<void> {
  await apiFetchVoid(`/api/agents/registry/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
}

export async function mintAgentToken(agentId: string): Promise<MintedAgentToken> {
  return apiFetchData<MintedAgentToken>(
    `/api/agents/registry/${encodeURIComponent(agentId)}/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export async function grantAgentCollectionEditor(
  agentId: string,
  collectionSlug: string,
): Promise<void> {
  await apiFetchVoid(
    `/api/agents/registry/${encodeURIComponent(agentId)}/collections/${encodeURIComponent(collectionSlug)}/editors`,
    { method: "PUT" },
  );
}

export async function fetchAgentTasks(status?: AgentTaskStatus): Promise<AgentTask[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetchData<AgentTask[]>(`/api/agents/tasks${query}`);
}

export async function fetchAgentTaskById(taskId: string): Promise<AgentTask> {
  return apiFetchData<AgentTask>(`/api/agents/tasks/${encodeURIComponent(taskId)}`);
}

export async function createAgentTask(input: {
  type: AgentTaskType;
  prompt: string;
  registeredAgentId: string;
  input?: Record<string, unknown>;
}): Promise<AgentTask> {
  return apiFetchData<AgentTask>("/api/agents/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function approveAgentTask(taskId: string): Promise<AgentTask> {
  return apiFetchData<AgentTask>(`/api/agents/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: "PUT",
  });
}

export async function rejectAgentTask(taskId: string): Promise<AgentTask> {
  return apiFetchData<AgentTask>(`/api/agents/tasks/${encodeURIComponent(taskId)}/reject`, {
    method: "PUT",
  });
}
