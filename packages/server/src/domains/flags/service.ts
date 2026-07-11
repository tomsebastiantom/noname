import { createHash } from "node:crypto";
import type {
  FlagService,
  FlagStorage,
  FlagDTO,
  CreateFlagInput,
  UpdateFlagInput,
  FlagFilters,
  EvaluationFilters,
  FlagEvaluationContext,
  EvaluationResult,
  TargetingRule,
  Condition,
  EvaluationRecord,
} from "./ports";
import { FeatureFlag } from "./entity";
import { flushEvents } from "../../shared/aggregate-root";
import { eventBus } from "../../shared/event-bus";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { FlagEvents } from "./events";

export function createFlagService(storage: FlagStorage): FlagService {
  return {
    async create(tenantId, input) {
      validateKey(input.key);
      validateType(input.type, input.defaultValue);
      normalizeTargeting(input.targeting);

      const existing = await storage.findByKey(tenantId, input.key);
      if (existing) {
        throw new ValidationError("key", `Flag with key '${input.key}' already exists`);
      }

      const flag = FeatureFlag.create(
        tenantId,
        input.key,
        input.type,
        input.description || "",
        input.defaultValue,
        input.targeting || [{ priority: 0, condition: { type: "always" }, value: input.defaultValue }],
        input.schemaId ?? null,
        input.variantId ?? null,
      );

      const saved = await storage.create(tenantId, {
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

    async list(tenantId, filters) {
      return storage.list(tenantId, filters);
    },

    async get(tenantId, id) {
      const flag = await storage.findById(tenantId, id);
      if (!flag) throw new NotFoundError("FeatureFlag", id);
      return flag;
    },

    async update(tenantId, id, input) {
      const existing = await storage.findById(tenantId, id);
      if (!existing) throw new NotFoundError("FeatureFlag", id);
      if (input.defaultValue !== undefined) {
        validateType(existing.type, input.defaultValue);
      }
      if (input.targeting) normalizeTargeting(input.targeting);

      const entity = new FeatureFlag(
        existing.id,
        existing.tenantId,
        existing.key,
        existing.type,
        existing.description,
        existing.defaultValue,
        existing.targeting,
        existing.status,
        existing.schemaId,
        existing.variantId,
        existing.createdAt,
        existing.updatedAt,
      );
      entity.update(
        input.description,
        input.defaultValue,
        input.targeting,
        input.status,
        input.schemaId,
        input.variantId,
      );

      const updated = await storage.update(tenantId, id, input);
      flushEvents(entity);
      return updated;
    },

    async archive(tenantId, id) {
      const existing = await storage.findById(tenantId, id);
      if (!existing) throw new NotFoundError("FeatureFlag", id);
      const entity = new FeatureFlag(
        existing.id,
        existing.tenantId,
        existing.key,
        existing.type,
        existing.description,
        existing.defaultValue,
        existing.targeting,
        existing.status,
        existing.schemaId,
        existing.variantId,
        existing.createdAt,
        existing.updatedAt,
      );
      entity.archive();
      const archived = await storage.archive(tenantId, id);
      flushEvents(entity);
      return archived;
    },

    async evaluate(tenantId, context, flagKeys) {
      const flags = await storage.list(tenantId, { status: "active" });
      const toEvaluate = flagKeys
        ? flags.filter((f) => flagKeys.includes(f.key))
        : flags;

      const results = await Promise.all(
        toEvaluate.map(async (flag) => {
          const result = evaluateFlag(flag, context);
          await record(storage, flag, context, result);
          return result;
        }),
      );

      return results;
    },

    async evaluateBatch(tenantId, contexts, flagKeys) {
      const batch = await Promise.all(
        contexts.map(async (ctx) => ({
          contextHash: ctx.contextHash,
          evaluations: await this.evaluate(tenantId, ctx, flagKeys),
        })),
      );
      return batch;
    },

    async listEvaluations(tenantId, flagId, filters) {
      // Basic authorization check: flag belongs to tenant.
      const flag = await storage.findById(tenantId, flagId);
      if (!flag) throw new NotFoundError("FeatureFlag", flagId);
      return storage.listEvaluations(flagId, filters);
    },
  };
}

function validateKey(key: string): void {
  if (!key || !/^[a-z0-9_]+$/.test(key)) {
    throw new ValidationError("key", "Flag key must be lowercase snake_case alphanumeric");
  }
}

function validateType(type: string, value: unknown): void {
  if (type === "boolean" && typeof value !== "boolean") {
    throw new ValidationError("defaultValue", "Boolean flag defaultValue must be boolean");
  }
  if (type === "percentage" && typeof value !== "boolean") {
    throw new ValidationError("defaultValue", "Percentage flag defaultValue must be boolean");
  }
}

function normalizeTargeting(targeting?: TargetingRule[]): void {
  if (!targeting) return;
  targeting.sort((a, b) => a.priority - b.priority);
}

function evaluateFlag(flag: FlagDTO, ctx: FlagEvaluationContext): EvaluationResult {
  if (flag.status !== "active") {
    return {
      flagKey: flag.key,
      flagId: flag.id,
      value: flag.defaultValue,
      matchedRule: null,
      reason: "flag_inactive",
    };
  }

  if (isScopedOut(flag, ctx)) {
    return {
      flagKey: flag.key,
      flagId: flag.id,
      value: flag.defaultValue,
      matchedRule: null,
      reason: "scope_mismatch",
    };
  }

  const sorted = [...flag.targeting].sort((a, b) => a.priority - b.priority);
  for (let i = 0; i < sorted.length; i++) {
    const rule = sorted[i]!;
    if (conditionMatches(rule.condition, ctx, flag, i)) {
      return {
        flagKey: flag.key,
        flagId: flag.id,
        value: rule.value,
        matchedRule: i,
        reason: `targeting_rule_${i}`,
      };
    }
  }

  return {
    flagKey: flag.key,
    flagId: flag.id,
    value: flag.defaultValue,
    matchedRule: null,
    reason: "default_value",
  };
}

function isScopedOut(flag: FlagDTO, ctx: FlagEvaluationContext): boolean {
  if (flag.schemaId && flag.schemaId !== ctx.schemaId) return true;
  if (flag.variantId && flag.variantId !== ctx.variantId) return true;
  return false;
}

function conditionMatches(condition: Condition, ctx: FlagEvaluationContext, flag: FlagDTO, index: number): boolean {
  switch (condition.type) {
    case "segment":
      return ctx.contextHash === condition.hash;
    case "segment_group":
      return condition.hashes.includes(ctx.contextHash);
    case "percentage":
      return deterministicPercentage(ctx.tenantId, flag.key, ctx.contextHash, condition.percent, condition.seed);
    case "property_match":
      return propertyMatches(condition, ctx.contextProperties);
    case "always":
      return true;
    case "expression":
      // Phase 0: no expression engine. Treated as non-match.
      return false;
    default:
      return false;
  }
}

function deterministicPercentage(
  tenantId: string,
  key: string,
  contextHash: string,
  percent: number,
  seed = "",
): boolean {
  const hash = createHash("sha256")
    .update(`${tenantId}:${key}:${contextHash}:${seed}`)
    .digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return bucket < percent / 100;
}

function propertyMatches(
  condition: Extract<Condition, { type: "property_match" }>,
  props: Record<string, string | number | boolean>,
): boolean {
  const actual = props[condition.property];
  if (actual === undefined) return false;

  switch (condition.operator) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "gt":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "lt":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    default:
      return false;
  }
}

async function record(
  storage: FlagStorage,
  flag: FlagDTO,
  ctx: FlagEvaluationContext,
  result: EvaluationResult,
): Promise<void> {
  const record: Omit<EvaluationRecord, "id"> = {
    flagId: flag.id,
    tenantId: flag.tenantId,
    contextHash: ctx.contextHash,
    value: result.value,
    matchedRule: result.matchedRule,
    reason: result.reason,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
    evaluatedAt: new Date(),
  };
  await storage.recordEvaluation(record);
  eventBus.publish(FlagEvents.EVALUATED, {
    flagId: flag.id,
    flagKey: flag.key,
    tenantId: flag.tenantId,
    contextHash: ctx.contextHash,
    value: result.value,
    reason: result.reason,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
  });
}
