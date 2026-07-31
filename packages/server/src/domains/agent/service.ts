import { context, propagation } from "@opentelemetry/api";
import { flushEvents } from "../../shared/aggregate-root";
import { AgentTask } from "./entity";
import type { AgentService, AgentTaskStorage } from "./ports";
import { getAgentQueue } from "./queue";
import { requireAgentTask, requireCompletedTask } from "./task-guards";

export function createAgentService(storage: AgentTaskStorage): AgentService {
  return {
    async create(orgId, input) {
      const entity = AgentTask.create(orgId, input.type, input.prompt, input.input || {});
      const saved = await storage.create(orgId, entity.toDTO());
      flushEvents(entity);

      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      const queue = getAgentQueue();
      await queue.add(
        entity.type,
        {
          taskId: entity.id,
          orgId,
          type: entity.type,
          prompt: entity.prompt,
          input: entity.input,
          traceparent: carrier.traceparent,
          tracestate: carrier.tracestate,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        },
      );

      return saved;
    },

    async list(orgId, filters) {
      return storage.list(orgId, filters);
    },

    get: (orgId, id) => requireAgentTask(storage, orgId, id),

    async approve(orgId, id) {
      const task = await requireCompletedTask(storage, orgId, id);
      const entity = AgentTask.fromDTO(task);
      entity.approve();
      const saved = await storage.update(orgId, id, { status: "approved" });
      flushEvents(entity);
      return saved;
    },

    async reject(orgId, id) {
      const task = await requireCompletedTask(storage, orgId, id);
      const entity = AgentTask.fromDTO(task);
      entity.reject();
      const saved = await storage.update(orgId, id, { status: "rejected" });
      flushEvents(entity);
      return saved;
    },
  };
}
