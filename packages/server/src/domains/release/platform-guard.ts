import { type PermissionKey, permissionsForServiceRoles } from "@noname/auth";
import type { Context } from "hono";
import { getOrgId } from "../../shared/org";
import { listProjectAuthorizations } from "../auth/adapters/zitadel/authorizations";
import { requireAuthenticatedUser } from "../auth/guards";

export type PlatformOperator = {
  userId: string;
  roles: string[];
  permissions: PermissionKey[];
};

/**
 * Verify the caller is a ZITADEL service account in the platform org with the `platform_operator` role.
 *
 * ZITADEL does not emit machine-user project roles in the access token, so the role is resolved server-side
 * from the authorization list (filtered to the platform project). The token proves the identity; ZITADEL proves
 * the role.
 */
export async function requirePlatformOperator(c: Context): Promise<PlatformOperator | Response> {
  const platformOrg = process.env.PLATFORM_ORG_ID?.trim();
  if (!platformOrg) {
    return c.json({ error: "Platform operator is not configured" }, 503);
  }
  if (getOrgId(c) !== platformOrg) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const platformProject = process.env.ZITADEL_PLATFORM_PROJECT_ID?.trim();
  if (!platformProject) {
    return c.json({ error: "Platform project is not configured" }, 503);
  }

  const auth = await requireAuthenticatedUser(c);
  if (auth instanceof Response) return auth;

  const userId = typeof auth.payload.sub === "string" ? auth.payload.sub.trim() : "";
  if (!userId) return c.json({ error: "Forbidden" }, 403);

  const authorizations = await listProjectAuthorizations(platformOrg, platformProject);
  const roles = (authorizations.find((row) => row.user?.id === userId)?.roles ?? [])
    .map((role) => role.key?.trim())
    .filter((role): role is string => Boolean(role));

  if (!roles.includes("platform_operator")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return { userId, roles, permissions: permissionsForServiceRoles(roles) };
}
