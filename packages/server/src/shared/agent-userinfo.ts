/**
 * OIDC userinfo resolver for delegated agent tokens.
 *
 * Exchanged ZITADEL access tokens do not always carry the project-role claim, while the userinfo response for
 * the same token does. Cache briefly so a request burst does not hammer the IdP; verification still fails closed
 * when the lookup fails.
 */
import { recordAgentUserInfo } from "./metrics";

const cache = new Map<string, { expiresAt: number; claims: Record<string, unknown> }>();
const TTL_MS = 60_000;

export async function resolveAgentUserInfo(
  token: string,
): Promise<Record<string, unknown> | null> {
  const key = token.slice(-40);
  const started = performance.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordAgentUserInfo("hit", (performance.now() - started) / 1000);
    return cached.claims;
  }

  const issuer = process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080";
  try {
    const response = await fetch(`${issuer}/oidc/v1/userinfo`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      recordAgentUserInfo("error", (performance.now() - started) / 1000);
      return null;
    }
    const claims = (await response.json()) as Record<string, unknown>;
    cache.set(key, { expiresAt: Date.now() + TTL_MS, claims });
    recordAgentUserInfo("miss", (performance.now() - started) / 1000);
    return claims;
  } catch {
    recordAgentUserInfo("error", (performance.now() - started) / 1000);
    return null;
  }
}
