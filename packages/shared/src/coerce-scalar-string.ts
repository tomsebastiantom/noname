/**
 * Coerce CMS / JSON scalar values to string without `[object Object]`.
 * Used by: @noname/client, @noname/server, @noname/workers.
 */
export function coerceScalarString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
