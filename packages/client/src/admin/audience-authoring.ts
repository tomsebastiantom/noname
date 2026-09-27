import type {
  AudienceCondition,
  AudienceExpiry,
  AudienceOperator,
  AudiencePerformanceSummary,
  RegisteredActivityType,
} from "./audiences";

export interface AudienceConditionDraft {
  activity: RegisteredActivityType;
  field: string;
  operator: string;
  value?: string;
}

export function buildAudienceCondition(draft: AudienceConditionDraft): AudienceCondition {
  const definition = draft.activity.fields[draft.field];
  if (!definition?.operators.includes(draft.operator as AudienceOperator)) {
    throw new Error("Condition must use a registered activity field and operator");
  }
  const operator = draft.operator as AudienceOperator;
  if (operator === "exists") return { field: draft.field, operator: "exists" };
  const rawValue = draft.value ?? "";
  const value =
    operator === "in"
      ? rawValue
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => parseTypedValue(item, definition.type))
      : parseTypedValue(rawValue, definition.type);
  if (operator === "in" && (!Array.isArray(value) || value.length === 0)) {
    throw new Error("An 'in' condition requires at least one value");
  }
  return { field: draft.field, operator, value };
}

export function buildAudienceExpiry(days: number): AudienceExpiry {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Audience membership expiry must be between 1 and 365 days");
  }
  return { afterMs: days * 24 * 60 * 60 * 1000 };
}

export function buildExperienceBinding(input: {
  pageKey: string;
  locale: string;
  schemaId: string;
  variantId: string;
  goalEvent: string;
  attributionDays: number;
  approvedGoalEvents: string[];
}) {
  const pageKey = normalizePageKey(input.pageKey);
  if (!pageKey) throw new Error("Experience bindings require a normalized page key");
  const locale = normalizeLocale(input.locale);
  if (input.locale.trim() && !locale) throw new Error("Experience binding locale is invalid");
  if (input.goalEvent && !input.approvedGoalEvents.includes(input.goalEvent)) {
    throw new Error("Experience bindings require an approved registered outcome event");
  }
  if (!input.schemaId.trim() || !input.variantId.trim()) {
    throw new Error("Experience bindings require a published schema and variant");
  }
  if (
    !Number.isInteger(input.attributionDays) ||
    input.attributionDays < 1 ||
    input.attributionDays > 30
  ) {
    throw new Error("Attribution window must be between 1 and 30 days");
  }
  return {
    pageKey,
    locale,
    schemaId: input.schemaId.trim(),
    variantId: input.variantId.trim(),
    goalEvent: input.goalEvent,
    attributionWindowMs: input.attributionDays * 24 * 60 * 60 * 1000,
  };
}

export function normalizePageKey(value: string): string | null {
  const path = value.trim().split(/[?#]/, 1)[0] ?? "";
  if (!path) return null;
  const absolutePath = path.startsWith("/") ? path : `/${path}`;
  if (absolutePath.split("/").some((segment) => segment === "." || segment === "..")) return null;
  const normalized = absolutePath.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  return /^\/[a-zA-Z0-9/_-]{0,255}$/.test(normalized) ? normalized : null;
}

export function normalizeLocale(value: string): string | null {
  const locale = value.trim();
  if (!locale) return null;
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? null;
  } catch {
    return null;
  }
}

export function isRegisteredPredicate(
  activity: RegisteredActivityType,
  field: string,
  operator: string,
): boolean {
  return Boolean(activity.fields[field]?.operators.some((allowed) => allowed === operator));
}

export function audienceListViewState(
  loading: boolean,
  definitionCount: number,
): "loading" | "empty" | "ready" {
  if (loading) return "loading";
  return definitionCount === 0 ? "empty" : "ready";
}

export function canActivateAudienceVersion(status: string, validated: boolean): boolean {
  return status === "draft" && validated;
}

export type AggregateAudiencePerformanceSummary = AudiencePerformanceSummary;

export function isAggregateAudienceMetrics(
  value: unknown,
): value is AggregateAudiencePerformanceSummary {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "audienceKey",
    "from",
    "to",
    "rateLabel",
    "rateDenominator",
    "minimumSampleSize",
    "bindings",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (
    typeof value.audienceKey !== "string" ||
    !/^[a-z][a-z0-9_-]{1,63}$/.test(value.audienceKey) ||
    typeof value.from !== "string" ||
    typeof value.to !== "string" ||
    value.rateLabel !== "observational_not_causal" ||
    value.rateDenominator !== "exposedAccountCount" ||
    value.minimumSampleSize !== 10 ||
    !Array.isArray(value.bindings)
  ) {
    return false;
  }
  return value.bindings.every((binding) => isAggregateBindingMetric(binding, 10));
}

function isAggregateBindingMetric(
  value: unknown,
  minimumSampleSize: number,
): value is AggregateAudiencePerformanceSummary["bindings"][number] {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "audienceDefinitionVersion",
    "bindingId",
    "bindingVersion",
    "sampleStatus",
    "servedDecisionCount",
    "renderedDecisionCount",
    "exposedAccountCount",
    "outcomeAccountCount",
    "outcomeRate",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  const { audienceDefinitionVersion, bindingId, bindingVersion } = value;
  const served = value.servedDecisionCount;
  const rendered = value.renderedDecisionCount;
  const exposed = value.exposedAccountCount;
  const outcomes = value.outcomeAccountCount;
  const rate = value.outcomeRate;
  if (
    !(
      audienceDefinitionVersion === null ||
      (Number.isSafeInteger(audienceDefinitionVersion) &&
        (audienceDefinitionVersion as number) >= 1)
    ) ||
    typeof bindingId !== "string" ||
    bindingId.length === 0 ||
    !Number.isSafeInteger(bindingVersion) ||
    (bindingVersion as number) < 1
  ) {
    return false;
  }
  if (value.sampleStatus === "insufficient_exposed_accounts") {
    return (
      served === null && rendered === null && exposed === null && outcomes === null && rate === null
    );
  }
  if (
    ![served, rendered, exposed].every(
      (count) => Number.isSafeInteger(count) && (count as number) >= minimumSampleSize,
    ) ||
    (served as number) < (rendered as number) ||
    (rendered as number) < (exposed as number)
  ) {
    return false;
  }
  if (value.sampleStatus === "outcomes_suppressed") {
    return outcomes === null && rate === null;
  }
  if (
    value.sampleStatus !== "available" ||
    !Number.isSafeInteger(outcomes) ||
    (outcomes as number) < minimumSampleSize ||
    (outcomes as number) > (exposed as number)
  ) {
    return false;
  }
  return (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    rate <= 1 &&
    Math.abs(rate - (outcomes as number) / (exposed as number)) < 1e-9
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTypedValue(
  value: string,
  type: RegisteredActivityType["fields"][string]["type"],
): string | number | boolean {
  if (type === "string" || type === "date") return value;
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("Expected a finite number");
    return parsed;
  }
  if (value !== "true" && value !== "false") throw new Error("Expected true or false");
  return value === "true";
}
