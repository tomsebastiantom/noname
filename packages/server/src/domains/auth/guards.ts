import {
  type AuthActor,
  actorHasPermission,
  allowProjectIdFallbackFromEnv,
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
  permissionsForServiceRoles,
  resolveAuthContextFromVerifiedPayload,
} from "@noname/auth";
import type { Context } from "hono";
import { resolveAgentUserInfo } from "../../shared/agent-userinfo";
import { verifyZitadelAgentToken } from "../../shared/agent-jwt";
import { resolveAgentIdentity } from "../../shared/agent-registry-resolver";
import { resolveAgentGrant } from "../../shared/agent-grant-resolver";
import { getOrgId, getUserId } from "../../shared/org";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { resolveZitadelJwk } from "./adapters/zitadel/jwks";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";
import type { AuthSubject } from "./authorization-port";
import { listProjectAuthorizations } from "./adapters/zitadel/authorizations";
import { bearerToken, resolveAccessToken } from "./token-source";
import { verifiedTokenPayload } from "./verified-token";

export { bearerToken, resolveAccessToken } from "./token-source";

export function authSubjectFromActor(actor: AuthActor): AuthSubject {
  if (actor.type === "agent") {
    return { type: "Agent", id: actor.agentSlug };
  }
  if (actor.type === "machine") {
    // Keto has no Service namespace. Mapping a service principal to Agent keeps relation tuples valid
    // until a service namespace exists; machines never reach document/collab authorization today.
    return { type: "Agent", id: actor.serviceId };
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

  const agentAudiences = [
    process.env.ZITADEL_CLIENT_ID,
    process.env.ZITADEL_PROJECT_ID,
    process.env.ZITADEL_PLATFORM_PROJECT_ID,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const agent = await verifyZitadelAgentToken(token, {
    issuer: zitadelIssuer(),
    audience: agentAudiences.length > 0 ? agentAudiences : undefined,
    resolveKey: resolveZitadelJwk,
    userInfo: resolveAgentUserInfo,
    clientId: process.env.ZITADEL_AGENT_CLIENT_ID?.trim() || undefined,
    maxLifetimeSeconds: Number(process.env.AGENT_TOKEN_MAX_LIFETIME_SECONDS ?? 43_200),
  });
  if (agent) {
    const orgId = getOrgId(c);
    if (!orgId || agent.orgId !== orgId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // A machine token is only an agent if it maps to a live registered agent, and it may only act for its
    // owner. This is what stops an orphaned machine key from acting after the agent row is deleted.
    const registered = await resolveAgentIdentity(orgId, agent.agentUserId);
    if (!registered || registered.ownerUserId !== agent.onBehalfOf) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Downscoping: the token may only use the permissions recorded at mint time, and that record must belong
    // to this agent. Without a grant row the token is not a token this API minted, so it is rejected.
    const grant = await resolveAgentGrant(orgId, agent.jti);
    if (!grant || grant.agentId !== registered.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const granted = new Set(grant.permissions);
    const permissions = agent.permissions.filter((permission) => granted.has(permission));
    if (permissions.length === 0) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return {
      type: "agent",
      agentId: registered.id,
      agentSlug: registered.slug,
      onBehalfOf: agent.onBehalfOf,
      orgId: agent.orgId,
      permissions,
      userToken: token,
    };
  }

  // An `act` claim is an agent token by definition. If agent verification failed, it must not fall through to
  // the human path, where its `sub` would be accepted as the user.
  const verifiedPayload = await verifiedTokenPayload(c);
  if (verifiedPayload?.act) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const auth = await requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const projectId = zitadelProjectIdOrNull() ?? undefined;
  // Permissions come only from the signature-verified payload.
  let { permissions } = await resolveAuthContextFromVerifiedPayload(
    auth.userToken,
    auth.payload,
    {
      projectId,
      issuer: zitadelIssuer(),
      allowProjectIdFallback: allowProjectIdFallbackFromEnv(process.env),
    },
  );

  // Service accounts do not carry project roles in the token (ZITADEL behavior). If the token has no role-derived
  // permissions, resolve its grants for this org/project server-side. This is the same rule the platform guard uses.
  if (permissions.length === 0 && projectId) {
    const orgId = getOrgId(c);
    if (orgId) {
      try {
        const rows = await listProjectAuthorizations(orgId, projectId);
        const roleKeys = (rows.find((row) => row.user?.id === auth.userId)?.roles ?? [])
          .map((role) => role.key?.trim())
          .filter((role): role is string => Boolean(role));
        permissions = permissionsForServiceRoles(roleKeys);
      } catch {
        // Leave permissions empty; the route will return 403 rather than assume a role.
      }
    }
  }

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
  if (actor.type !== "human") {
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
