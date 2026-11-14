import { PERMISSIONS } from "@noname/auth";
import type { Context } from "hono";
import type { TenantSettingsService } from "../../documents/ports";
import { requirePermission } from "../guards";
import type { AuthService } from "../ports";

export interface AuthRouteDeps {
  service: AuthService;
  tenantSettings?: TenantSettingsService;
  /**
   * Records privileged token issuance. Tokens themselves are ZITADEL's; what is worth recording is that a token
   * carrying platform authority was minted, to whom, and when — never the token value.
   */
  audit?: (input: {
    orgId: string;
    action: string;
    actorId: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export async function requireAuthManage(
  c: Context,
): Promise<Awaited<ReturnType<typeof requirePermission>>> {
  return requirePermission(c, PERMISSIONS.AUTH_MANAGE);
}

export async function requireScopeManage(
  c: Context,
): Promise<Awaited<ReturnType<typeof requirePermission>>> {
  return requirePermission(c, PERMISSIONS.SCOPE_MANAGE);
}

/** Access manager or store admin — tags, teams, capped user invite. */
export async function requireScopeOrAuthManage(
  c: Context,
): Promise<Awaited<ReturnType<typeof requirePermission>>> {
  const auth = await requirePermission(c, PERMISSIONS.SCOPE_MANAGE);
  if (!(auth instanceof Response)) return auth;
  return requireAuthManage(c);
}
