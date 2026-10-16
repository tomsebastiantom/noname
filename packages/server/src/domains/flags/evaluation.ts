import { createHash } from "node:crypto";
import { ValidationError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";
import { sweepFlagEvaluations } from "./evaluation-retention";
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

const DEFAULT_GLOBAL_SUBJECT = { kind: "global", key: "global" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && UUID_RE.test(normalized) ? normalized : null;
}

/** Omitted context is explicitly global; no caller-supplied context/hash is needed. */
export function normalizeEvaluationContext(
  orgId: string,
  context?: Partial<FlagEvaluationContext> | null,
): FlagEvaluationContext {
  const rawSubject = context?.subject;
  const subject =
    rawSubject &&
    (rawSubject.kind === "account" ||
      rawSubject.kind === "session" ||
      rawSubject.kind === "global") &&
    typeof rawSubject.key === "string" &&
    rawSubject.key.trim()
      ? { kind: rawSubject.kind, key: rawSubject.key.trim() }
      : DEFAULT_GLOBAL_SUBJECT;

  return {
    orgId,
    subject,
    audienceKeys: Array.isArray(context?.audienceKeys)
      ? context.audienceKeys.filter(
          (key): key is string => typeof key === "string" && key.length > 0,
        )
      : [],
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
    if (conditionMatches(rule.condition, ctx, flag)) {
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
    subjectKind: ctx.subject.kind,
    value: result.value,
    matchedRule: result.matchedRule,
    reason: result.reason,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
    evaluatedAt: new Date(),
  };
}

/**
 * Publishes one `flag.evaluated` event carrying the whole evaluation set, rather than one event per
 * flag.
 *
 * `eventBus.publish` fans out to Redis unconditionally — Redis pub/sub has no "are there
 * subscribers?" check, and this publisher never consulted whether anything listens — so per-flag
 * publishing cost one Redis publish per evaluated flag on the per-request evaluation path. This
 * event currently has **no subscribers anywhere in the codebase**, so batching it changes a
 * published contract that nothing consumes; it is called out here because a future consumer must
 * expect `evaluations` to be an array, not a single flag.
 */
function publishEvaluated(
  evaluated: { flag: FlagDTO; ctx: FlagEvaluationContext; result: EvaluationResult }[],
): void {
  if (evaluated.length === 0) return;
  const [first] = evaluated;
  eventBus.publish(FlagEvents.EVALUATED, {
    orgId: first?.flag.orgId,
    subjectKind: first?.ctx.subject.kind,
    evaluations: evaluated.map(({ flag, ctx, result }) => ({
      flagId: flag.id,
      flagKey: flag.key,
      value: result.value,
      reason: result.reason,
      schemaId: ctx.schemaId,
      variantId: ctx.variantId,
    })),
  });
}

export async function recordEvaluation(
  storage: FlagStorage,
  flag: FlagDTO,
  ctx: FlagEvaluationContext,
  result: EvaluationResult,
): Promise<void> {
  await storage.recordEvaluation(toEvaluationRecord(flag, ctx, result));
  publishEvaluated([{ flag, ctx, result }]);
}

/** Records every flag's evaluation in a single DB round-trip instead of one insert per flag —
 * this is the hot per-request evaluation path, so flag count should not translate 1:1 into
 * DB round-trips. The event publish is batched for the same reason: one Redis publish per request
 * rather than one per flag. */
export async function recordEvaluations(
  storage: FlagStorage,
  evaluated: { flag: FlagDTO; ctx: FlagEvaluationContext; result: EvaluationResult }[],
): Promise<void> {
  await storage.recordEvaluations(
    evaluated.map(({ flag, ctx, result }) => toEvaluationRecord(flag, ctx, result)),
  );
  publishEvaluated(evaluated);

  // Retention trigger. This is the only place evaluations are written, so it is the natural hook —
  // but it is deliberately not awaited: `sweepFlagEvaluations` is time-gated to at most one run per
  // interval, and the evaluation path must not pay for a DELETE. The guard keeps loosely-typed test
  // doubles that predate this method from producing a spurious failure log.
  if (typeof storage.deleteEvaluationsOlderThan === "function") {
    void sweepFlagEvaluations(storage).catch(() => undefined);
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
): boolean {
  switch (condition.type) {
    case "audience":
      return ctx.audienceKeys.includes(condition.key);
    case "audience_group":
      return condition.keys.some((key) => ctx.audienceKeys.includes(key));
    case "percentage":
      return deterministicPercentage(
        ctx.orgId,
        flag.key,
        ctx.subject,
        condition.percent,
        condition.seed,
      );
    case "property_match":
      return propertyMatches(condition, ctx.contextProperties);
    case "always":
      return true;
    case "expression":
      return false;
    default:
      throw new ValidationError(
        "targeting",
        "Legacy segment/segment_group targeting cannot be migrated automatically. Replace it with a named audience/audience_group or typed property_match rule before evaluating this flag; do not reuse opaque hashes as audience keys.",
      );
  }
}

function deterministicPercentage(
  orgId: string,
  key: string,
  subject: FlagEvaluationContext["subject"],
  percent: number,
  seed = "",
): boolean {
  const material = JSON.stringify([orgId, key, subject.kind, subject.key, seed]);
  const hash = createHash("sha256").update(material).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return bucket < percent / 100;
}

function propertyMatches(
  condition: Extract<Condition, { type: "property_match" }>,
  props: FlagEvaluationContext["contextProperties"],
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
