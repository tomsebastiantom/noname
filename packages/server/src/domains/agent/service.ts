import { context, propagation } from "@opentelemetry/api";
import { flushEvents } from "../../shared/aggregate-root";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { AgentTask } from "./entity";
import type { AgentService, AgentTaskStorage } from "./ports";
import { getAgentQueue } from "./queue";

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

    async get(orgId, id) {
      const task = await storage.findById(orgId, id);
      if (!task) throw new NotFoundError("AgentTask", id);
      return task;
    },

    async approve(orgId, id) {
      const task = await storage.findById(orgId, id);
      if (!task) throw new NotFoundError("AgentTask", id);

      if (task.status !== "completed") {
        throw new ValidationError(
          "status",
          `Task must be completed to approve. Current: ${task.status}`,
        );
      }

      const entity = AgentTask.fromDTO(task);
      entity.approve();
      const saved = await storage.update(orgId, id, { status: "approved" });
      flushEvents(entity);
      return saved;
    },

    async reject(orgId, id) {
      const task = await storage.findById(orgId, id);
      if (!task) throw new NotFoundError("AgentTask", id);

      if (task.status !== "completed") {
        throw new ValidationError(
          "status",
          `Task must be completed to reject. Current: ${task.status}`,
        );
      }

      const entity = AgentTask.fromDTO(task);
      entity.reject();
      const saved = await storage.update(orgId, id, { status: "rejected" });
      flushEvents(entity);
      return saved;
    },
  };
}
