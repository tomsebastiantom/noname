/**
 * Coerce CMS / JSON scalar values to string without `[object Object]`.
 * Use for unknown or Record<string, unknown> field values — not for intentional JSON serialization.
 */
export function coerceScalarString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
