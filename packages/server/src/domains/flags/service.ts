import { flushEvents } from "../../shared/aggregate-root";
import { ConflictError } from "../../shared/domain-error";
import { FeatureFlag } from "./entity";
import { evaluateFlag, normalizeEvaluationContext, recordEvaluation } from "./evaluation";
import { requireFlag } from "./flag-guards";
import { normalizeTargeting, validateFlagDefaultValue, validateFlagKey } from "./flag-validation";
import type { FlagService, FlagStorage } from "./ports";

export function createFlagService(storage: FlagStorage): FlagService {
  return {
    async create(orgId, input) {
      validateFlagKey(input.key);
      validateFlagDefaultValue(input.type, input.defaultValue);
      normalizeTargeting(input.targeting);

      const existing = await storage.findByKey(orgId, input.key);
      if (existing) {
        throw new ConflictError(`Flag with key '${input.key}' already exists`, { key: input.key });
      }

      const flag = FeatureFlag.create(
        orgId,
        input.key,
        input.type,
        input.description || "",
        input.defaultValue,
        input.targeting || [
          { priority: 0, condition: { type: "always" }, value: input.defaultValue },
        ],
        input.schemaId ?? null,
        input.variantId ?? null,
      );

      const saved = await storage.create(orgId, {
        key: flag.key,
        type: flag.type,
        description: flag.description,
        defaultValue: flag.defaultValue,
        targeting: flag.targeting,
        schemaId: flag.schemaId,
        variantId: flag.variantId,
      });
      flushEvents(flag);
      return saved;
    },

    async list(orgId, filters) {
      return storage.list(orgId, filters);
    },

    get: (orgId, id) => requireFlag(storage, orgId, id),

    async update(orgId, id, input) {
      const existing = await requireFlag(storage, orgId, id);
      if (input.defaultValue !== undefined) {
        validateFlagDefaultValue(existing.type, input.defaultValue);
      }
      if (input.targeting) normalizeTargeting(input.targeting);

      const entity = FeatureFlag.fromDTO(existing);
      entity.update(
        input.description,
        input.defaultValue,
        input.targeting,
        input.status,
        input.schemaId,
        input.variantId,
      );

      const updated = await storage.update(orgId, id, input);
      flushEvents(entity);
      return updated;
    },

    async archive(orgId, id) {
      const existing = await requireFlag(storage, orgId, id);
      const entity = FeatureFlag.fromDTO(existing);
      entity.archive();
      const archived = await storage.archive(orgId, id);
      flushEvents(entity);
      return archived;
    },

    async evaluate(orgId, context, flagKeys) {
      const ctx = normalizeEvaluationContext(orgId, context);
      const flags = await storage.list(orgId, { status: "active" });
      const toEvaluate = flagKeys ? flags.filter((f) => flagKeys.includes(f.key)) : flags;

      const results = await Promise.all(
        toEvaluate.map(async (flag) => {
          const result = evaluateFlag(flag, ctx);
          await recordEvaluation(storage, flag, ctx, result);
          return result;
        }),
      );

      return results;
    },

    async evaluateBatch(orgId, contexts, flagKeys) {
      const batch = await Promise.all(
        contexts.map(async (rawCtx) => {
          const ctx = normalizeEvaluationContext(orgId, rawCtx);
          return {
            contextHash: ctx.contextHash,
            evaluations: await this.evaluate(orgId, ctx, flagKeys),
          };
        }),
      );
      return batch;
    },

    listEvaluations: async (orgId, flagId, filters) => {
      await requireFlag(storage, orgId, flagId);
      return storage.listEvaluations(flagId, filters);
    },
  };
}
