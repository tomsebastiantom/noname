import { ValidationError } from "../../shared/domain-error";
import type { Condition, TargetingRule } from "./ports";

export function validateFlagKey(key: string): void {
  if (!key || !/^[a-z0-9_]+$/.test(key)) {
    throw new ValidationError("key", "Flag key must be lowercase snake_case alphanumeric");
  }
}

export function validateFlagDefaultValue(type: string, value: unknown): void {
  if (type === "boolean" && typeof value !== "boolean") {
    throw new ValidationError("defaultValue", "Boolean flag defaultValue must be boolean");
  }
  if (type === "percentage" && typeof value !== "boolean") {
    throw new ValidationError("defaultValue", "Percentage flag defaultValue must be boolean");
  }
}

export function normalizeTargeting(targeting?: TargetingRule[]): void {
  if (!targeting) return;
  validateTargeting(targeting);
  targeting.sort((a, b) => a.priority - b.priority);
}

/** Validate API inputs and stored JSON before unsupported legacy rules can be evaluated. */
export function validateTargeting(targeting: unknown): asserts targeting is TargetingRule[] {
  if (!Array.isArray(targeting)) {
    throw new ValidationError("targeting", "Targeting must be an array of supported rules");
  }

  for (const [index, rawRule] of targeting.entries()) {
    const condition = (rawRule as { condition?: unknown } | null)?.condition;
    const kind = (condition as { type?: unknown } | null)?.type;
    if (kind === "segment" || kind === "segment_group") {
      throw new ValidationError(
        `targeting[${index}].condition`,
        "Legacy segment targeting uses opaque historical keys and cannot be migrated automatically. Replace this rule with an explicitly named audience/audience_group or typed property_match rule; do not copy the old key as an audience key.",
      );
    }
    if (
      condition &&
      typeof condition === "object" &&
      ["hash", "hashes", "contextHash", "context_hash", "segment", "segments"].some(
        (key) => key in condition,
      )
    ) {
      throw new ValidationError(
        `targeting[${index}].condition`,
        "Raw segment/hash targeting aliases are not supported; use named audience keys or typed properties.",
      );
    }
    if (
      kind !== "audience" &&
      kind !== "audience_group" &&
      kind !== "percentage" &&
      kind !== "property_match" &&
      kind !== "always" &&
      kind !== "expression"
    ) {
      throw new ValidationError(
        `targeting[${index}].condition`,
        "Unsupported targeting condition. Use audience, audience_group, percentage, property_match, always, or expression.",
      );
    }
    validateCondition(condition as Condition, index);
  }
}

function validateCondition(condition: Condition, index: number): void {
  switch (condition.type) {
    case "audience":
      if (typeof condition.key !== "string" || !condition.key.trim()) {
        throw new ValidationError(`targeting[${index}].condition.key`, "Audience key is required");
      }
      return;
    case "audience_group":
      if (!Array.isArray(condition.keys) || condition.keys.some((key) => typeof key !== "string")) {
        throw new ValidationError(
          `targeting[${index}].condition.keys`,
          "Audience keys must be strings",
        );
      }
      return;
    case "percentage":
      if (!Number.isFinite(condition.percent) || condition.percent < 0 || condition.percent > 100) {
        throw new ValidationError(
          `targeting[${index}].condition.percent`,
          "Percentage must be between 0 and 100",
        );
      }
      return;
    case "property_match":
      if (!condition.property || !["eq", "neq", "in", "gt", "lt"].includes(condition.operator)) {
        throw new ValidationError(
          `targeting[${index}].condition`,
          "Invalid typed property_match rule",
        );
      }
      if (condition.operator === "in" && !Array.isArray(condition.value)) {
        throw new ValidationError(
          `targeting[${index}].condition.value`,
          "The in operator requires an array",
        );
      }
      return;
    case "always":
    case "expression":
      return;
  }
}
