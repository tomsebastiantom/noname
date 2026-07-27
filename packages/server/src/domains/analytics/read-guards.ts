import { PERMISSIONS } from "@noname/auth";
import type { Context } from "hono";
import { getOrgId } from "../../shared/org";
import { requirePermission } from "../auth/guards";

/** Admin-only analytics / replay reads. */
export async function denyUnlessAnalyticsView(c: Context): Promise<Response | null> {
  const auth = await requirePermission(c, PERMISSIONS.ANALYTICS_VIEW);
  return auth instanceof Response ? auth : null;
}

/** Org from edge HMAC — never trust client query/body org on read paths. */
export function requireTrustedOrgId(c: Context): string | Response {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "org id required" }, 400);
  }
  return orgId;
}

/** Replay blob keys are org-prefixed; reject traversal and cross-org access. */
export function assertReplayStorageKey(orgId: string, storageKey: string): boolean {
  const prefix = `replays/${orgId}/`;
  if (!storageKey.startsWith(prefix)) return false;
  if (storageKey.includes("..")) return false;
  if (!storageKey.endsWith(".json")) return false;
  return true;
}
