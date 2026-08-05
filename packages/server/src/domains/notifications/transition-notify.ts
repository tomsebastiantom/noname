import { coerceScalarString } from "@noname/shared";
import type { NotifyInput } from "./ports";

export function parseTransitionNotify(params: Record<string, unknown>): NotifyInput | null {
  const notify = params.notify;
  if (!notify || typeof notify !== "object" || Array.isArray(notify)) {
    return null;
  }

  const record = notify as Record<string, unknown>;
  const to = coerceScalarString(record.to).trim();
  const trigger = coerceScalarString(record.trigger).trim();
  if (!to || !trigger) return null;

  const userIdRaw = coerceScalarString(record.userId).trim();
  const idempotencyKeyRaw = coerceScalarString(record.idempotencyKey).trim();
  const variablesRaw = record.variables;

  let variables: Record<string, string> | undefined;
  if (variablesRaw && typeof variablesRaw === "object" && !Array.isArray(variablesRaw)) {
    variables = {};
    for (const [key, value] of Object.entries(variablesRaw as Record<string, unknown>)) {
      variables[key] = coerceScalarString(value);
    }
  }

  return {
    trigger,
    to,
    userId: userIdRaw || undefined,
    idempotencyKey: idempotencyKeyRaw || undefined,
    variables,
  };
}
