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
  tenantId: string;
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
  create(tenantId: string, input: AgentTaskDTO): Promise<AgentTaskDTO>;
  findById(tenantId: string, id: string): Promise<AgentTaskDTO | null>;
  list(tenantId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  update(tenantId: string, id: string, patch: Partial<AgentTaskDTO>): Promise<AgentTaskDTO>;
}

export interface AgentTaskFilters {
  status?: AgentTaskStatus;
  type?: AgentTaskType;
}

export interface AgentService {
  create(tenantId: string, input: CreateAgentTaskInput): Promise<AgentTaskDTO>;
  list(tenantId: string, filters?: AgentTaskFilters): Promise<AgentTaskDTO[]>;
  get(tenantId: string, id: string): Promise<AgentTaskDTO | null>;
  approve(tenantId: string, id: string): Promise<AgentTaskDTO>;
  reject(tenantId: string, id: string): Promise<AgentTaskDTO>;
}
