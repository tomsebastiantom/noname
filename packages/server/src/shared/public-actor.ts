import { timingSafeEqual } from "node:crypto";
import type { TenantSettingsService } from "../domains/documents/ports";

/**
 * Anonymous storefront actor, verified by publishable key (`x-publishable-key`
 * bound to the edge-resolved org). Generic — any domain route calls this;
 * nothing here knows about carts, commerce, or any vertical.
 *
 * Complements `denyUnless` (JWT users): routes accept either a signed-in user
 * or a key-holding storefront caller. No key + no JWT = deny.
 */
export interface PublicActor {
  type: "public";
  orgId: string;
}

type HeaderReader = {
  req: { header: (name: string) => string | undefined };
};

export async function requirePublicActor(
  c: HeaderReader,
  orgId: string,
  tenantSettings: Pick<TenantSettingsService, "get">,
): Promise<PublicActor | null> {
  const presented = c.req.header("x-publishable-key")?.trim();
  if (!presented) return null;
  let expected: string | null;
  try {
    expected = (await tenantSettings.get(orgId)).publishableKey;
  } catch {
    return null;
  }
  if (!expected || presented.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return { type: "public", orgId };
}
