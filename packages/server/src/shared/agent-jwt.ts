import {
  expandPermissionsFromKeys,
  orgIdFromTokenPayload,
  verifyAccessToken,
  type JwkResolver,
  type PermissionKey,
} from "@noname/auth";

/**
 * Verified ZITADEL agent token.
 *
 * Delegation is expressed with the standard `act` claim: `sub` is the user the agent acts for, `act.sub` is the
 * agent's own machine identity. The token is verified with JWKS first; nothing here trusts an unverified payload.
 */
export type VerifiedAgentToken = {
  /** ZITADEL machine-user / service-account id of the agent. */
  agentUserId: string;
  /** Owner the agent acts for (`sub`). */
  onBehalfOf: string;
  orgId: string;
  permissions: PermissionKey[];
  exp: number;
};

export type VerifyAgentTokenOptions = {
  issuer: string;
  audience?: string | string[];
  resolveKey: JwkResolver;
  expectedOrgId?: string;
};

export async function verifyZitadelAgentToken(
  token: string,
  options: VerifyAgentTokenOptions,
): Promise<VerifiedAgentToken | null> {
  const payload = await verifyAccessToken(token, {
    issuer: options.issuer,
    audience: options.audience,
    resolveKey: options.resolveKey,
  });
  if (!payload) return null;

  const act = payload.act;
  if (!act || typeof act !== "object" || Array.isArray(act)) return null;
  const agentUserId = (act as Record<string, unknown>).sub;
  if (typeof agentUserId !== "string" || agentUserId.trim() === "") return null;

  const onBehalfOf = payload.sub;
  if (typeof onBehalfOf !== "string" || onBehalfOf.trim() === "") return null;

  const orgId = orgIdFromTokenPayload(payload);
  if (!orgId) return null;
  if (options.expectedOrgId && options.expectedOrgId !== orgId) return null;

  const roles = payload["urn:zitadel:iam:org:project:roles"];
  const roleKeys =
    roles && typeof roles === "object" && !Array.isArray(roles) ? Object.keys(roles) : [];
  const permissions = expandPermissionsFromKeys(roleKeys);
  if (permissions.length === 0) return null;

  const exp = payload.exp;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) return null;

  return {
    agentUserId,
    onBehalfOf,
    orgId,
    permissions,
    exp,
  };
}
