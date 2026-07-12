import { and, eq, gte, lte } from "drizzle-orm";
import { flags, flagEvaluations } from "../schema";
import type { Database } from "../../../drizzle";
import type { FlagDTO, FlagStorage, EvaluationRecord } from "../ports";

export function createPostgresFlagStorage(db: Database): FlagStorage {
  return {
    async create(tenantId, input) {
      const [row] = await db
        .insert(flags)
        .values({
          tenantId,
          key: input.key,
          type: input.type,
          description: input.description || "",
          defaultValue: input.defaultValue as Record<string, unknown>,
          targeting: input.targeting as unknown as Record<string, unknown>[],
          schemaId: input.schemaId,
          variantId: input.variantId,
        })
        .returning();
      if (!row) throw new Error("Failed to create flag");
      return mapFlag(row);
    },

    async findById(tenantId, id) {
      const [row] = await db
        .select()
        .from(flags)
        .where(and(eq(flags.tenantId, tenantId), eq(flags.id, id)));
      return row ? mapFlag(row) : null;
    },

    async findByKey(tenantId, key) {
      const [row] = await db
        .select()
        .from(flags)
        .where(and(eq(flags.tenantId, tenantId), eq(flags.key, key)));
      return row ? mapFlag(row) : null;
    },

    async list(tenantId, filters = {}) {
      const conditions = [eq(flags.tenantId, tenantId)];
      if (filters.status) conditions.push(eq(flags.status, filters.status));
      if (filters.type) conditions.push(eq(flags.type, filters.type));
      if (filters.schemaId !== undefined) {
        conditions.push(
          filters.schemaId === null
            ? eq(flags.schemaId, null as unknown as string)
            : eq(flags.schemaId, filters.schemaId),
        );
      }
      const rows = await db
        .select()
        .from(flags)
        .where(and(...conditions));
      return rows.map(mapFlag);
    },

    async update(tenantId, id, input) {
      const [row] = await db
        .update(flags)
        .set({
          description: input.description,
          defaultValue: input.defaultValue as Record<string, unknown> | undefined,
          targeting: input.targeting as unknown as Record<string, unknown>[] | undefined,
          status: input.status,
          schemaId: input.schemaId,
          variantId: input.variantId,
          updated_at: new Date(),
        })
        .where(and(eq(flags.tenantId, tenantId), eq(flags.id, id)))
        .returning();
      if (!row) throw new Error("Failed to update flag");
      return mapFlag(row);
    },

    async archive(tenantId, id) {
      return this.update(tenantId, id, { status: "archived" });
    },

    async recordEvaluation(record) {
      await db.insert(flagEvaluations).values({
        flagId: record.flagId,
        tenantId: record.tenantId,
        contextHash: record.contextHash,
        value: record.value as Record<string, unknown>,
        matchedRule: record.matchedRule,
        reason: record.reason,
        schemaId: record.schemaId,
        variantId: record.variantId,
        evaluated_at: record.evaluatedAt,
      });
    },

    async listEvaluations(flagId, filters = {}) {
      const conditions = [eq(flagEvaluations.flagId, flagId)];
      if (filters.from) conditions.push(gte(flagEvaluations.evaluated_at, filters.from));
      if (filters.to) conditions.push(lte(flagEvaluations.evaluated_at, filters.to));
      if (filters.contextHash)
        conditions.push(eq(flagEvaluations.contextHash, filters.contextHash));
      const rows = await db
        .select()
        .from(flagEvaluations)
        .where(and(...conditions));
      return rows.map(mapEvaluation);
    },
  };
}

function mapFlag(row: typeof flags.$inferSelect): FlagDTO {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    type: row.type,
    description: row.description,
    defaultValue: row.defaultValue,
    targeting: row.targeting as unknown as FlagDTO["targeting"],
    status: row.status,
    schemaId: row.schemaId ?? null,
    variantId: row.variantId ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvaluation(row: typeof flagEvaluations.$inferSelect): EvaluationRecord {
  return {
    id: row.id,
    flagId: row.flagId,
    tenantId: row.tenantId,
    contextHash: row.contextHash,
    value: row.value,
    matchedRule: row.matchedRule as number | null,
    reason: row.reason,
    schemaId: row.schemaId ?? null,
    variantId: row.variantId ?? null,
    evaluatedAt: row.evaluated_at,
  };
}
