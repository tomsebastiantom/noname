export type AgentTaskType =
  | "generate_layout"
  | "generate_content"
  | "generate_machine"
  | "analyze_analytics";

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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentTaskInput {
  type: AgentTaskType;
  prompt: string;
  input?: Record<string, unknown>;
}

export interface AgentTaskStorage {
  create(orgId: string, input: AgentTaskDTO): Promise<AgentTaskDTO>;
  findById(orgId: string, id: string): Promise<AgentTaskDTO | null>;
  list(orgId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  update(orgId: string, id: string, patch: Partial<AgentTaskDTO>): Promise<AgentTaskDTO>;
}

export interface AgentTaskFilters {
  status?: AgentTaskStatus;
  type?: AgentTaskType;
}

export interface AgentService {
  create(orgId: string, input: CreateAgentTaskInput): Promise<AgentTaskDTO>;
  list(orgId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  get(orgId: string, id: string): Promise<AgentTaskDTO | null>;
  approve(orgId: string, id: string): Promise<AgentTaskDTO>;
  reject(orgId: string, id: string): Promise<AgentTaskDTO>;
}
