/**
 * Access-token extraction from a request.
 *
 * Kept separate from `guards.ts` so `verified-token.ts` can import it without
 * creating a cycle (`guards` depends on `verified-token` for verification).
 */

import type { Context } from "hono";

export function bearerToken(c: Context): string | null {
  const auth = c.req.header("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Bearer header, or `?access_token=` for EventSource (cannot set Authorization). */
export function resolveAccessToken(c: Context): string | null {
  const header = bearerToken(c);
  if (header) return header;
  const query = c.req.query("access_token");
  return typeof query === "string" && query.trim() ? query.trim() : null;
}
