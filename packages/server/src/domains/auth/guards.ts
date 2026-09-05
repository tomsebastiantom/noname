import {
  type AuthActor,
  actorHasPermission,
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
  resolveAuthContextFromAccessToken,
  userIdFromAccessToken,
} from "@noname/auth";
import type { Context } from "hono";
import { verifyAgentToken } from "../../shared/agent-token";
import { getOrgId, getUserId } from "../../shared/org";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";
import type { AuthSubject } from "./authorization-port";

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

export function authSubjectFromActor(actor: AuthActor): AuthSubject {
  if (actor.type === "agent") {
    return { type: "Agent", id: actor.agentSlug };
  }
  return { type: "User", id: actor.userId };
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

export async function requireAuthenticatedActor(
  c: Context,
): Promise<(AuthActor & { userToken: string }) | Response> {
  const token = bearerToken(c);
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const agentSecret = process.env.AGENT_TOKEN_SECRET ?? "";
  const agentClaims = verifyAgentToken(token, agentSecret);
  if (agentClaims) {
    const orgId = getOrgId(c);
    if (!orgId || agentClaims.orgId !== orgId) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return {
      type: "agent",
      agentId: agentClaims.agentId,
      agentSlug: agentClaims.agentSlug,
      onBehalfOf: agentClaims.onBehalfOf,
      orgId: agentClaims.orgId,
      permissions: agentClaims.permissions,
      userToken: token,
    };
  }

  const auth = requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const projectId = zitadelProjectIdOrNull() ?? undefined;
  const { permissions } = await resolveAuthContextFromAccessToken(auth.userToken, {
    projectId,
    issuer: zitadelIssuer(),
  });
  return {
    type: "human",
    userId: auth.userId,
    permissions,
    userToken: auth.userToken,
  };
}

export async function requireActorPermission(
  c: Context,
  permission: PermissionKey,
): Promise<(AuthActor & { userToken: string }) | Response> {
  const actor = await requireAuthenticatedActor(c);
  if (actor instanceof Response) return actor;
  if (!actorHasPermission(actor, permission)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return actor;
}

/** @deprecated Prefer requireActorPermission for routes that agents may call. */
export async function requirePermission(
  c: Context,
  permission: PermissionKey,
): Promise<{ userId: string; userToken: string; permissions: PermissionKey[] } | Response> {
  const actor = await requireActorPermission(c, permission);
  if (actor instanceof Response) return actor;
  if (actor.type === "agent") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return { userId: actor.userId, userToken: actor.userToken, permissions: actor.permissions };
}

export async function requireHumanPermission(
  c: Context,
  permission: PermissionKey,
): Promise<{ userId: string; userToken: string; permissions: PermissionKey[] } | Response> {
  return requirePermission(c, permission);
}

export function isStoreAdmin(permissions: Iterable<PermissionKey>): boolean {
  return hasPermission(permissions, PERMISSIONS.AUTH_MANAGE);
}
