import { NotFoundError, ValidationError } from "../../shared/domain-error";
import type { AgentTaskDTO, AgentTaskStorage } from "./ports";

export async function requireAgentTask(
  storage: AgentTaskStorage,
  orgId: string,
  id: string,
): Promise<AgentTaskDTO> {
  const task = await storage.findById(orgId, id);
  if (!task) throw new NotFoundError("AgentTask", id);
  return task;
}

export async function requireCompletedTask(
  storage: AgentTaskStorage,
  orgId: string,
  id: string,
): Promise<AgentTaskDTO> {
  const task = await requireAgentTask(storage, orgId, id);
  if (task.status !== "completed") {
    throw new ValidationError(
      "status",
      `Task must be completed to review. Current: ${task.status}`,
    );
  }
  return task;
}
