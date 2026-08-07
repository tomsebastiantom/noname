import { createHash } from "node:crypto";
import { eventBus } from "../../shared/event-bus";
import { FlagEvents } from "./events";
import type {
  Condition,
  EvaluationRecord,
  EvaluationResult,
  FlagDTO,
  FlagEvaluationContext,
  FlagStorage,
} from "./ports";
import { isActive } from "./shared/flag-status";

const DEFAULT_CONTEXT_HASH = "default";

function optionalUuid(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value;
}

/** Public evaluate may omit context before SDK setContext — never persist null context_hash. */
export function normalizeEvaluationContext(
  orgId: string,
  context?: Partial<FlagEvaluationContext> | null,
): FlagEvaluationContext {
  const hash = context?.contextHash?.trim();
  return {
    orgId,
    contextHash: hash || DEFAULT_CONTEXT_HASH,
    contextProperties: context?.contextProperties ?? {},
    schemaId: optionalUuid(context?.schemaId ?? null),
    variantId: optionalUuid(context?.variantId ?? null),
  };
}

export function evaluateFlag(flag: FlagDTO, ctx: FlagEvaluationContext): EvaluationResult {
  if (!isActive(flag)) {
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

function toEvaluationRecord(
  flag: FlagDTO,
  ctx: FlagEvaluationContext,
  result: EvaluationResult,
): Omit<EvaluationRecord, "id"> {
  return {
    flagId: flag.id,
    orgId: flag.orgId,
    contextHash: ctx.contextHash,
    value: result.value,
    matchedRule: result.matchedRule,
    reason: result.reason,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
    evaluatedAt: new Date(),
  };
}

function publishEvaluated(flag: FlagDTO, ctx: FlagEvaluationContext, result: EvaluationResult): void {
  eventBus.publish(FlagEvents.EVALUATED, {
    flagId: flag.id,
    flagKey: flag.key,
    orgId: flag.orgId,
    contextHash: ctx.contextHash,
    value: result.value,
    reason: result.reason,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
  });
}

export async function recordEvaluation(
  storage: FlagStorage,
  flag: FlagDTO,
  ctx: FlagEvaluationContext,
  result: EvaluationResult,
): Promise<void> {
  await storage.recordEvaluation(toEvaluationRecord(flag, ctx, result));
  publishEvaluated(flag, ctx, result);
}

/** Records every flag's evaluation in a single DB round-trip instead of one insert per flag —
 * this is the hot per-request evaluation path, so flag count should not translate 1:1 into
 * DB round-trips. Event-bus publish stays per-flag; it's in-process/Redis pub-sub, not a DB write. */
export async function recordEvaluations(
  storage: FlagStorage,
  evaluated: { flag: FlagDTO; ctx: FlagEvaluationContext; result: EvaluationResult }[],
): Promise<void> {
  await storage.recordEvaluations(
    evaluated.map(({ flag, ctx, result }) => toEvaluationRecord(flag, ctx, result)),
  );
  for (const { flag, ctx, result } of evaluated) {
    publishEvaluated(flag, ctx, result);
  }
}

function isScopedOut(flag: FlagDTO, ctx: FlagEvaluationContext): boolean {
  if (flag.schemaId && flag.schemaId !== ctx.schemaId) return true;
  if (flag.variantId && flag.variantId !== ctx.variantId) return true;
  return false;
}

function conditionMatches(
  condition: Condition,
  ctx: FlagEvaluationContext,
  flag: FlagDTO,
  _index: number,
): boolean {
  switch (condition.type) {
    case "segment":
      return ctx.contextHash === condition.hash;
    case "segment_group":
      return condition.hashes.includes(ctx.contextHash);
    case "percentage":
      return deterministicPercentage(
        ctx.orgId,
        flag.key,
        ctx.contextHash,
        condition.percent,
        condition.seed,
      );
    case "property_match":
      return propertyMatches(condition, ctx.contextProperties);
    case "always":
      return true;
    default:
      return false;
  }
}

function deterministicPercentage(
  orgId: string,
  key: string,
  contextHash: string,
  percent: number,
  seed = "",
): boolean {
  const hash = createHash("sha256").update(`${orgId}:${key}:${contextHash}:${seed}`).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
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
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual > condition.value
      );
    case "lt":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual < condition.value
      );
    default:
      return false;
  }
}
