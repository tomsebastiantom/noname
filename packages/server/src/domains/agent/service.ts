import { context, propagation } from "@opentelemetry/api";
import type { AgentService, AgentTaskStorage } from "./ports";
import { AgentTask } from "./entity";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { flushEvents } from "../../shared/aggregate-root";
import { getAgentQueue } from "./queue";

export function createAgentService(storage: AgentTaskStorage): AgentService {
  return {
    async create(tenantId, input) {
      const entity = AgentTask.create(tenantId, input.type, input.prompt, input.input || {});
      const saved = await storage.create(tenantId, entity.toDTO());
      flushEvents(entity);

      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      const queue = getAgentQueue();
      await queue.add(
        entity.type,
        {
          taskId: entity.id,
          tenantId,
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

    async list(tenantId, filters) {
      return storage.list(tenantId, filters);
    },

    async get(tenantId, id) {
      const task = await storage.findById(tenantId, id);
      if (!task) throw new NotFoundError("AgentTask", id);
      return task;
    },

    async approve(tenantId, id) {
      const task = await storage.findById(tenantId, id);
      if (!task) throw new NotFoundError("AgentTask", id);

      if (task.status !== "completed") {
        throw new ValidationError(
          "status",
          `Task must be completed to approve. Current: ${task.status}`,
        );
      }

      const entity = AgentTask.fromDTO(task);
      entity.approve();
      const saved = await storage.update(tenantId, id, { status: "approved" });
      flushEvents(entity);
      return saved;
    },

    async reject(tenantId, id) {
      const task = await storage.findById(tenantId, id);
      if (!task) throw new NotFoundError("AgentTask", id);

      if (task.status !== "completed") {
        throw new ValidationError(
          "status",
          `Task must be completed to reject. Current: ${task.status}`,
        );
      }

      const entity = AgentTask.fromDTO(task);
      entity.reject();
      const saved = await storage.update(tenantId, id, { status: "rejected" });
      flushEvents(entity);
      return saved;
    },
  };
}
