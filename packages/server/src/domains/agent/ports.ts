import type { ActorType, WriteAudit } from "@noname/auth";

export interface TaskAuditRecord {
  actorType: ActorType;
  actorId: string;
  onBehalfOf: string | null;
  at: Date;
}

export type AgentTaskType =
  | "generate_layout"
  | "generate_content"
  | "generate_machine"
  | "analyze_analytics"
  | "orchestrate";

export type AgentTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "approved"
  | "rejected";

export interface AgentTaskDTO {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentTaskInput {
  type: AgentTaskType;
  prompt: string;
  input?: Record<string, unknown>;
  registeredAgentId?: string | null;
}

export interface AgentTaskFilters {
  status?: AgentTaskStatus;
  type?: AgentTaskType;
  registeredAgentIds?: string[];
  /** Matches `input.targetLayoutDocumentId` (editor agent thread restore). */
  targetLayoutDocumentId?: string;
  /** When set, returns the N most recent tasks (ascending by createdAt for display). */
  limit?: number;
}

export interface AgentTaskStorage {
  create(orgId: string, input: AgentTaskDTO): Promise<AgentTaskDTO>;
  findById(orgId: string, id: string): Promise<AgentTaskDTO | null>;
  list(orgId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  update(orgId: string, id: string, patch: Partial<AgentTaskDTO>): Promise<AgentTaskDTO>;
}

export interface AgentService {
  create(orgId: string, input: CreateAgentTaskInput, audit?: WriteAudit): Promise<AgentTaskDTO>;
  list(orgId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  get(orgId: string, id: string): Promise<AgentTaskDTO | null>;
  approve(orgId: string, id: string, audit?: WriteAudit): Promise<AgentTaskDTO>;
  reject(orgId: string, id: string, audit?: WriteAudit): Promise<AgentTaskDTO>;
}
