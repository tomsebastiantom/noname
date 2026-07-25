import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { AgentTaskDTO, AgentTaskStorage } from "../ports";
import { agentTasks } from "../schema";

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
      const conditions = [eq(agentTasks.orgId, orgId)];
      if (filters.status) conditions.push(eq(agentTasks.status, filters.status));
      if (filters.type) conditions.push(eq(agentTasks.type, filters.type));
      const rows = await db
        .select()
        .from(agentTasks)
        .where(and(...conditions));
      return rows.map(mapTask);
    },

    async update(orgId, id, patch) {
      const [row] = await db
        .update(agentTasks)
        .set({
          status: patch.status,
          output: patch.output as Record<string, unknown> | null | undefined,
          error: patch.error,
          model: patch.model,
          tokens: patch.tokens,
          updated_at: new Date(),
        })
        .where(and(eq(agentTasks.orgId, orgId), eq(agentTasks.id, id)))
        .returning();
      if (!row) throw new Error("Failed to update agent task");
      return mapTask(row);
    },
  };
}

function mapTask(row: typeof agentTasks.$inferSelect): AgentTaskDTO {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
