import type { Context } from "hono";

export function dateRangeFromQuery(c: Context): { from?: Date; to?: Date } {
  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  return {
    from: fromRaw ? new Date(fromRaw) : undefined,
    to: toRaw ? new Date(toRaw) : undefined,
  };
}
