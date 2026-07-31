import {
  hasPermission,
  type PermissionKey,
  resolveAuthContextFromAccessToken,
  userIdFromAccessToken,
} from "@noname/auth";
import type { Context } from "hono";
import { getUserId } from "../../shared/org";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";

export function bearerToken(c: Context): string | null {
  const auth = c.req.header("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function requireAuthenticatedUser(
  c: Context,
): { userId: string; userToken: string } | Response {
  const userToken = bearerToken(c);
  if (!userToken) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const userId = getUserId(c) || userIdFromAccessToken(userToken) || "";
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return { userId, userToken };
}

export async function requirePermission(
  c: Context,
  permission: PermissionKey,
): Promise<{ userId: string; userToken: string; permissions: PermissionKey[] } | Response> {
  const auth = requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const projectId = zitadelProjectIdOrNull() ?? undefined;
  const { permissions } = await resolveAuthContextFromAccessToken(auth.userToken, {
    projectId,
    issuer: zitadelIssuer(),
  });
  if (!hasPermission(permissions, permission)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return { ...auth, permissions };
}
