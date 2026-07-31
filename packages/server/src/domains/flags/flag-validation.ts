import { ValidationError } from "../../shared/domain-error";
import type { TargetingRule } from "./ports";

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
  targeting.sort((a, b) => a.priority - b.priority);
}
