import { PERMISSIONS } from "@noname/auth";
import type { Context } from "hono";
import type { TenantSettingsService } from "../../documents/contracts";
import { requirePermission } from "../guards";
import type { AuthService } from "../ports";

export interface AuthRouteDeps {
  service: AuthService;
  tenantSettings?: TenantSettingsService;
}

export async function requireAuthManage(
  c: Context,
): Promise<Awaited<ReturnType<typeof requirePermission>>> {
  return requirePermission(c, PERMISSIONS.AUTH_MANAGE);
}
