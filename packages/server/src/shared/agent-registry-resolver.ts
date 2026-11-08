import type { RegisteredAgentRow } from "../domains/agent/adapters/registry-postgres";

/**
 * Guard-side mapping from a ZITADEL machine identity (`act.sub`) to a live registered agent.
 *
 * The resolver is registered by bootstrap because the auth guard must not import the agent domain. It fails
 * closed: when no resolver is registered, an agent token is rejected rather than trusted.
 */
type ResolveAgent = (
  orgId: string,
  zitadelAgentUserId: string,
) => Promise<RegisteredAgentRow | null>;

let resolver: ResolveAgent | null = null;

export function setAgentIdentityResolver(fn: ResolveAgent): void {
  resolver = fn;
}

export async function resolveAgentIdentity(
  orgId: string,
  zitadelAgentUserId: string,
): Promise<RegisteredAgentRow | null> {
  if (!resolver) return null;
  return resolver(orgId, zitadelAgentUserId);
}
