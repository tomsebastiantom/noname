/**
 * Guard-side downscoping lookup: the permission set recorded when an agent token was minted, keyed by `jti`.
 *
 * Registered by bootstrap (the auth guard must not import the agent domain) and fails closed when absent.
 */
type ResolveGrant = (
  orgId: string,
  jti: string,
) => Promise<{
  agentId: string;
  subjectUserId: string;
  permissions: string[];
  expiresAt: Date;
} | null>;

let resolver: ResolveGrant | null = null;

export function setAgentGrantResolver(fn: ResolveGrant): void {
  resolver = fn;
}

export async function resolveAgentGrant(
  orgId: string,
  jti: string,
): Promise<{
  agentId: string;
  subjectUserId: string;
  permissions: string[];
  expiresAt: Date;
} | null> {
  if (!resolver) return null;
  return resolver(orgId, jti);
}
