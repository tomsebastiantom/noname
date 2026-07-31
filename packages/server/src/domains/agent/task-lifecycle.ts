import { flushEvents } from "../../shared/aggregate-root";
import type { AgentTask } from "./entity";
import type { AgentTaskStorage } from "./ports";

export async function persistAgentTask(
  storage: AgentTaskStorage,
  orgId: string,
  entity: AgentTask,
): Promise<void> {
  await storage.update(orgId, entity.id, {
    status: entity.status,
    output: entity.output,
    error: entity.error,
    model: entity.model,
    tokens: entity.tokens,
  });
  flushEvents(entity);
}
