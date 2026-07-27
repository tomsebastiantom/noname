import type { Context } from "hono";
import { getUserId } from "../../shared/org";
import { decodeAccessTokenPayload, userIdFromAccessToken } from "./jwt-user";
import { hasPermission, type PermissionKey } from "./permissions";
import { permissionsFromJwt } from "./roles-from-jwt";
import { zitadelProjectIdOrNull } from "./zitadel-project-id";

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

export function requirePermission(
  c: Context,
  permission: PermissionKey,
): { userId: string; userToken: string; permissions: PermissionKey[] } | Response {
  const auth = requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const payload = decodeAccessTokenPayload(auth.userToken);
  if (!payload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const projectId = zitadelProjectIdOrNull() ?? undefined;
  const permissions = permissionsFromJwt(payload, { projectId });
  if (!hasPermission(permissions, permission)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return { ...auth, permissions };
}
