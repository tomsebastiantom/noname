import type { PermissionKey } from "@noname/auth";
import type { Context } from "hono";
import { requireActorPermission } from "./guards";

/** Returns a 401/403 Response when denied; null when the caller may proceed. */
export async function denyUnless(c: Context, permission: PermissionKey): Promise<Response | null> {
  const actor = await requireActorPermission(c, permission);
  if (actor instanceof Response) return actor;
  if (actor.type === "agent") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}
