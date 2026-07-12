import type { FlagDTO, FlagStorage, EvaluationRecord } from "../ports";

export function createInMemoryFlagStorage(): FlagStorage {
  const flags = new Map<string, FlagDTO>();
  const evaluations = new Map<string, EvaluationRecord[]>();

  return {
    async create(tenantId, input) {
      const now = new Date();
      const flag: FlagDTO = {
        id: crypto.randomUUID(),
        tenantId,
        key: input.key,
        type: input.type,
        description: input.description || "",
        defaultValue: input.defaultValue,
        targeting: input.targeting || [],
        status: "active",
        schemaId: input.schemaId ?? null,
        variantId: input.variantId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      flags.set(flag.id, flag);
      evaluations.set(flag.id, []);
      return flag;
    },

    async findById(tenantId, id) {
      const flag = flags.get(id);
      return flag && flag.tenantId === tenantId ? flag : null;
    },

    async findByKey(tenantId, key) {
      for (const flag of flags.values()) {
        if (flag.tenantId === tenantId && flag.key === key) return flag;
      }
      return null;
    },

    async list(tenantId, filters = {}) {
      return [...flags.values()].filter((f) => {
        if (f.tenantId !== tenantId) return false;
        if (filters.status && f.status !== filters.status) return false;
        if (filters.type && f.type !== filters.type) return false;
        if (filters.schemaId !== undefined && f.schemaId !== filters.schemaId) return false;
        return true;
      });
    },

    async update(tenantId, id, input) {
      const existing = await this.findById(tenantId, id);
      if (!existing) throw new Error("Flag not found");
      const updated: FlagDTO = {
        ...existing,
        description: input.description ?? existing.description,
        defaultValue: input.defaultValue ?? existing.defaultValue,
        targeting: input.targeting ?? existing.targeting,
        status: input.status ?? existing.status,
        schemaId: input.schemaId !== undefined ? input.schemaId : existing.schemaId,
        variantId: input.variantId !== undefined ? input.variantId : existing.variantId,
        updatedAt: new Date(),
      };
      flags.set(id, updated);
      return updated;
    },

    async archive(tenantId, id) {
      return this.update(tenantId, id, { status: "archived" });
    },

    async recordEvaluation(record) {
      const list = evaluations.get(record.flagId) || [];
      const withId: EvaluationRecord = { ...record, id: crypto.randomUUID() };
      list.push(withId);
      evaluations.set(record.flagId, list);
    },

    async listEvaluations(flagId, filters = {}) {
      const list = evaluations.get(flagId) || [];
      return list.filter((e) => {
        if (filters.from && e.evaluatedAt < filters.from) return false;
        if (filters.to && e.evaluatedAt > filters.to) return false;
        if (filters.contextHash && e.contextHash !== filters.contextHash) return false;
        return true;
      });
    },
  };
}
