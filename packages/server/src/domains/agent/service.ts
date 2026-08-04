import { flushEvents } from "../../shared/aggregate-root";
import { injectTraceCarrier } from "../../shared/bullmq-trace";
import { taskAuditRecord } from "../../shared/task-audit";
import { AgentTask } from "./entity";
import type { AgentService, AgentTaskStorage } from "./ports";
import { getAgentQueue } from "./queue";
import { requireAgentTask, requireCompletedTask } from "./task-guards";

export function createAgentService(storage: AgentTaskStorage): AgentService {
  return {
    async create(orgId, input, audit) {
      const registeredAgentId = input.registeredAgentId ?? null;
      const entity = AgentTask.create(
        orgId,
        input.type,
        input.prompt,
        input.input || {},
        audit,
        registeredAgentId,
      );
      const dto = entity.toDTO();
      const saved = await storage.create(orgId, {
        ...dto,
        registeredAgentId,
        createdBy: audit ? taskAuditRecord(audit, dto.createdAt) : null,
        approvedBy: null,
        rejectedBy: null,
      });
      flushEvents(entity);

      const queue = getAgentQueue();
      await queue.add(
        entity.type,
        {
          taskId: entity.id,
          orgId,
          type: entity.type,
          prompt: entity.prompt,
          input: entity.input,
          ...injectTraceCarrier(),
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

    async approve(orgId, id, audit) {
      const task = await requireCompletedTask(storage, orgId, id);
      const entity = AgentTask.fromDTO(task);
      entity.approve(audit);
      const approvedBy = audit ? taskAuditRecord(audit) : null;
      const saved = await storage.update(orgId, id, {
        status: "approved",
        approvedBy,
        rejectedBy: null,
      });
      flushEvents(entity);
      return saved;
    },

    async reject(orgId, id, audit) {
      const task = await requireCompletedTask(storage, orgId, id);
      const entity = AgentTask.fromDTO(task);
      entity.reject(audit);
      const rejectedBy = audit ? taskAuditRecord(audit) : null;
      const saved = await storage.update(orgId, id, {
        status: "rejected",
        rejectedBy,
        approvedBy: null,
      });
      flushEvents(entity);
      return saved;
    },
  };
}
