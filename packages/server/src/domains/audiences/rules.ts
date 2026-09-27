import type {
  ActivityTypeRegistry,
  AudienceCondition,
  AudienceOperator,
  AudienceScalar,
  RegisteredActivityField,
} from "./ports";

const operators = new Set<AudienceOperator>([
  "equals",
  "notEquals",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
]);

export function validateCondition(
  condition: unknown,
  fields: Record<string, RegisteredActivityField>,
): asserts condition is AudienceCondition {
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    nodes++;
    if (depth > 8 || nodes > 64 || node === null || typeof node !== "object" || Array.isArray(node))
      throw new Error("Invalid condition tree");
    const record = node as Record<string, unknown>;
    if (
      Object.keys(record).length === 1 &&
      (Array.isArray(record.all) || Array.isArray(record.any))
    ) {
      const key = Array.isArray(record.all) ? "all" : "any";
      const clauses = record[key] as unknown[];
      if (clauses.length < 1 || clauses.length > 32)
        throw new Error("Condition group must contain 1-32 clauses");
      clauses.forEach((child) => {
        visit(child, depth + 1);
      });
      return;
    }
    if (
      Object.keys(record).some((k) => !["field", "operator", "value"].includes(k)) ||
      typeof record.field !== "string" ||
      typeof record.operator !== "string"
    )
      throw new Error("Invalid condition clause");
    const field = fields[record.field];
    if (!field) throw new Error(`Unregistered rule field: ${record.field}`);
    const operator = record.operator as AudienceOperator;
    if (!operators.has(operator) || !field.operators.includes(operator))
      throw new Error(`Unregistered operator ${operator} for ${record.field}`);
    if (operator === "exists") {
      if ("value" in record) throw new Error("exists operator does not accept a value");
      return;
    }
    if (!("value" in record)) throw new Error("Condition value is required");
    if (operator === "in") {
      if (
        !Array.isArray(record.value) ||
        record.value.length < 1 ||
        record.value.length > 100 ||
        !record.value.every((v) => matchesType(field.type, v))
      )
        throw new Error("Invalid membership condition value");
      return;
    }
    if (!matchesType(field.type, record.value))
      throw new Error(`Invalid value for ${record.field}`);
  };
  visit(condition, 0);
}

function matchesType(type: RegisteredActivityField["type"], value: unknown): boolean {
  if (type === "date") return typeof value === "string" && !Number.isNaN(Date.parse(value));
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

export function validateDefinitionVersion(
  input: {
    activityType: string;
    activityVersion: number;
    condition: unknown;
    action: string;
    expiry: unknown;
  },
  registry: ActivityTypeRegistry,
): void {
  const activityType = registry.get(input.activityType, input.activityVersion);
  if (!activityType)
    throw new Error(
      `Unregistered activity type/version: ${input.activityType}@${input.activityVersion}`,
    );
  validateCondition(input.condition, activityType.fields);
  if (input.action !== "assign" && input.action !== "remove")
    throw new Error("Invalid membership action");
  if (input.action === "assign") {
    const expiry = input.expiry as {
      afterMs?: unknown;
      untilRevoked?: unknown;
      revokedBy?: unknown;
    } | null;
    if (!expiry || typeof expiry !== "object") throw new Error("Invalid expiry policy");
    if (
      Object.keys(expiry).length === 1 &&
      typeof expiry.afterMs === "number" &&
      Number.isSafeInteger(expiry.afterMs) &&
      expiry.afterMs > 0 &&
      expiry.afterMs <= 365 * 24 * 60 * 60 * 1000
    )
      return;
    if (
      Object.keys(expiry).length === 2 &&
      expiry.untilRevoked === true &&
      expiry.revokedBy &&
      typeof expiry.revokedBy === "object"
    ) {
      const revokedBy = expiry.revokedBy as {
        activityType?: unknown;
        activityVersion?: unknown;
        condition?: unknown;
      };
      if (
        typeof revokedBy.activityType !== "string" ||
        !Number.isSafeInteger(revokedBy.activityVersion)
      )
        throw new Error("Invalid revocation trigger");
      const revoker = registry.get(revokedBy.activityType, revokedBy.activityVersion as number);
      if (!revoker)
        throw new Error(
          `Unregistered revocation activity: ${revokedBy.activityType}@${revokedBy.activityVersion}`,
        );
      validateCondition(revokedBy.condition, revoker.fields);
      return;
    }
    throw new Error("Expiry must be bounded or have a registered revocation trigger");
  }
  if (
    input.expiry &&
    typeof input.expiry === "object" &&
    Object.keys(input.expiry as object).length > 0
  )
    throw new Error("Remove action does not accept expiry");
}

export function evaluateCondition(
  condition: AudienceCondition,
  facts: Record<string, unknown>,
  fields?: Record<string, RegisteredActivityField>,
): boolean {
  if ("all" in condition)
    return condition.all.every((item) => evaluateCondition(item, facts, fields));
  if ("any" in condition)
    return condition.any.some((item) => evaluateCondition(item, facts, fields));
  const actual = readRegisteredField(facts, condition.field);
  if (condition.operator === "exists") return actual !== undefined && actual !== null;
  const expected = condition.value as AudienceScalar | AudienceScalar[];
  const fieldType = fields?.[condition.field]?.type;
  if (condition.operator === "in")
    return (
      Array.isArray(expected) && expected.some((value) => compare(actual, value, fieldType) === 0)
    );
  const cmp = compare(actual, expected as AudienceScalar, fieldType);
  switch (condition.operator) {
    case "equals":
      return cmp === 0;
    case "notEquals":
      return cmp !== 0;
    case "gt":
      return cmp > 0;
    case "gte":
      return cmp >= 0;
    case "lt":
      return cmp < 0;
    case "lte":
      return cmp <= 0;
    default:
      return false;
  }
}

function readRegisteredField(facts: Record<string, unknown>, field: string): unknown {
  let value: unknown = facts;
  for (const part of field.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, part))
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
function compare(
  a: unknown,
  b: AudienceScalar,
  fieldType?: RegisteredActivityField["type"],
): number {
  if (a instanceof Date) a = a.toISOString();
  if (typeof a === "string" && typeof b === "string") {
    if (fieldType === "date") {
      const at = Date.parse(a);
      const bt = Date.parse(b);
      return at === bt ? 0 : at < bt ? -1 : 1;
    }
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  const scalar =
    typeof a === "string" ||
    typeof a === "boolean" ||
    (typeof a === "number" && Number.isFinite(a));
  return scalar && a === b ? 0 : -1;
}
