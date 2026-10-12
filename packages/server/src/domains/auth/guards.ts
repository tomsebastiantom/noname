import {
  type AuthActor,
  actorHasPermission,
  allowProjectIdFallbackFromEnv,
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
  resolveAuthContextFromVerifiedPayload,
} from "@noname/auth";
import type { Context } from "hono";
import { verifyAgentToken } from "../../shared/agent-token";
import { getOrgId, getUserId } from "../../shared/org";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";
import type { AuthSubject } from "./authorization-port";
import { bearerToken, resolveAccessToken } from "./token-source";
import { verifiedTokenPayload } from "./verified-token";

export { bearerToken, resolveAccessToken } from "./token-source";

export function authSubjectFromActor(actor: AuthActor): AuthSubject {
  if (actor.type === "agent") {
    return { type: "Agent", id: actor.agentSlug };
  }
  return { type: "User", id: actor.userId };
}

/**
 * Require a token whose signature, issuer, audience, and expiry verify.
 *
 * Identity comes from the edge-signed `x-user-id` when present, otherwise from
 * the verified `sub`. The unverified decode path is never a source of identity.
 */
export async function requireAuthenticatedUser(
  c: Context,
): Promise<{ userId: string; userToken: string; payload: Record<string, unknown> } | Response> {
  const userToken = resolveAccessToken(c);
  if (!userToken) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const payload = await verifiedTokenPayload(c, userToken);
  if (!payload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const userId = getUserId(c) || sub;
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return { userId, userToken, payload };
}

export async function requireAuthenticatedActor(
  c: Context,
): Promise<(AuthActor & { userToken: string }) | Response> {
  const token = resolveAccessToken(c);
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

  const auth = await requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const projectId = zitadelProjectIdOrNull() ?? undefined;
  // Permissions come only from the signature-verified payload.
  const { permissions } = await resolveAuthContextFromVerifiedPayload(
    auth.userToken,
    auth.payload,
    {
      projectId,
      issuer: zitadelIssuer(),
      allowProjectIdFallback: allowProjectIdFallbackFromEnv(process.env),
    },
  );
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

/** Re-exported for callers that only need the raw token. */
export { bearerToken as rawBearerToken };
