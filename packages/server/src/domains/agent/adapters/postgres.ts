import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { AgentTaskDTO, AgentTaskStorage, TaskAuditRecord } from "../ports";
import { agentTasks } from "../schema";

type AgentTaskRow = typeof agentTasks.$inferSelect;

export function createPostgresAgentTaskStorage(db: Database): AgentTaskStorage {
  return {
    async create(_orgId, input) {
      const [row] = await db
        .insert(agentTasks)
        .values({
          id: input.id,
          orgId: input.orgId,
          type: input.type,
          status: input.status,
          prompt: input.prompt,
          input: input.input as Record<string, unknown>,
          output: input.output as Record<string, unknown> | null,
          error: input.error,
          model: input.model,
          tokens: input.tokens,
          createdActorType: input.createdBy?.actorType ?? null,
          createdActorId: input.createdBy?.actorId ?? null,
          createdOnBehalfOf: input.createdBy?.onBehalfOf ?? null,
          approvedActorType: input.approvedBy?.actorType ?? null,
          approvedActorId: input.approvedBy?.actorId ?? null,
          approvedOnBehalfOf: input.approvedBy?.onBehalfOf ?? null,
          approvedAt: input.approvedBy?.at ?? null,
          rejectedActorType: input.rejectedBy?.actorType ?? null,
          rejectedActorId: input.rejectedBy?.actorId ?? null,
          rejectedOnBehalfOf: input.rejectedBy?.onBehalfOf ?? null,
          rejectedAt: input.rejectedBy?.at ?? null,
          registeredAgentId: input.registeredAgentId,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
        })
        .returning();
      if (!row) throw new Error("Failed to create agent task");
      return mapTask(row);
    },

    async findById(orgId, id) {
      const [row] = await db
        .select()
        .from(agentTasks)
        .where(and(eq(agentTasks.orgId, orgId), eq(agentTasks.id, id)));
      return row ? mapTask(row) : null;
    },

    async list(orgId, filters = {}) {
      if (filters.registeredAgentIds?.length === 0) return [];
      const conditions = [eq(agentTasks.orgId, orgId)];
      if (filters.status) conditions.push(eq(agentTasks.status, filters.status));
      if (filters.type) conditions.push(eq(agentTasks.type, filters.type));
      if (filters.registeredAgentIds?.length) {
        conditions.push(inArray(agentTasks.registeredAgentId, filters.registeredAgentIds));
      }
      if (filters.targetLayoutDocumentId) {
        conditions.push(
          sql`${agentTasks.input}->>'targetLayoutDocumentId' = ${filters.targetLayoutDocumentId}`,
        );
      }
      if (filters.limit) {
        const rows = await db
          .select()
          .from(agentTasks)
          .where(and(...conditions))
          .orderBy(desc(agentTasks.created_at))
          .limit(filters.limit);
        return [...rows].reverse().map(mapTask);
      }
      const rows = await db
        .select()
        .from(agentTasks)
        .where(and(...conditions))
        .orderBy(asc(agentTasks.created_at));
      return rows.map(mapTask);
    },

    async update(orgId, id, patch) {
      const set: Partial<typeof agentTasks.$inferInsert> = {
        updated_at: new Date(),
      };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.output !== undefined) set.output = patch.output as Record<string, unknown> | null;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.model !== undefined) set.model = patch.model;
      if (patch.tokens !== undefined) set.tokens = patch.tokens;
      if (patch.approvedBy !== undefined) {
        set.approvedActorType = patch.approvedBy?.actorType ?? null;
        set.approvedActorId = patch.approvedBy?.actorId ?? null;
        set.approvedOnBehalfOf = patch.approvedBy?.onBehalfOf ?? null;
        set.approvedAt = patch.approvedBy?.at ?? null;
      }
      if (patch.rejectedBy !== undefined) {
        set.rejectedActorType = patch.rejectedBy?.actorType ?? null;
        set.rejectedActorId = patch.rejectedBy?.actorId ?? null;
        set.rejectedOnBehalfOf = patch.rejectedBy?.onBehalfOf ?? null;
        set.rejectedAt = patch.rejectedBy?.at ?? null;
      }

      const [row] = await db
        .update(agentTasks)
        .set(set)
        .where(and(eq(agentTasks.orgId, orgId), eq(agentTasks.id, id)))
        .returning();
      if (!row) throw new Error("Failed to update agent task");
      return mapTask(row);
    },
  };
}

function mapAuditRecord(
  actorType: string | null,
  actorId: string | null,
  onBehalfOf: string | null,
  at: Date | null,
): TaskAuditRecord | null {
  if (!actorType || !actorId || !at) return null;
  return {
    actorType: actorType as TaskAuditRecord["actorType"],
    actorId,
    onBehalfOf,
    at,
  };
}

function mapTask(row: AgentTaskRow): AgentTaskDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    status: row.status,
    prompt: row.prompt,
    input: row.input as Record<string, unknown>,
    output: row.output as Record<string, unknown> | null,
    error: row.error,
    model: row.model,
    tokens: row.tokens,
    registeredAgentId: row.registeredAgentId,
    createdBy: mapAuditRecord(
      row.createdActorType,
      row.createdActorId,
      row.createdOnBehalfOf,
      row.created_at,
    ),
    approvedBy: mapAuditRecord(
      row.approvedActorType,
      row.approvedActorId,
      row.approvedOnBehalfOf,
      row.approvedAt,
    ),
    rejectedBy: mapAuditRecord(
      row.rejectedActorType,
      row.rejectedActorId,
      row.rejectedOnBehalfOf,
      row.rejectedAt,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
