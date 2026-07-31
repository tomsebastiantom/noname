import type { PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import { requirePermission } from "./guards";

/** Returns a 401/403 Response when denied; null when the caller may proceed. */
export async function denyUnless(c: Context, permission: PermissionKey): Promise<Response | null> {
  const auth = await requirePermission(c, permission);
  return auth instanceof Response ? auth : null;
}
