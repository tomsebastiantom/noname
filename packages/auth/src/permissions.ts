/**
 * Platform auth laws — shared by API server and edge worker.
 *
 * STABLE (change via deploy + ZITADEL role key sync):
 *   - PERMISSIONS — capability keys checked by requirePermission()
 *   - PLATFORM_ROLES — role keys recognized from ZITADEL tokens
 *   - ROLE_PERMISSIONS — what each role key means (role → permissions)
 *
 * RUNTIME (no redeploy — ZITADEL admin / Users UI):
 *   - Which user holds which role key for an org
 *   - Invite, revoke, role assignment changes
 */

/** Platform-wide permission keys — same for every store (org). */
export const PERMISSIONS = {
  STOREFRONT_VIEW: "storefront:view",
  CONTENT_DRAFT_WRITE: "content:draft_write",
  CONTENT_PUBLISH: "content:publish",
  LAYOUT_DRAFT_WRITE: "layout:draft_write",
  LAYOUT_PUBLISH: "layout:publish",
  PAGE_DRAFT_WRITE: "page:draft_write",
  PAGE_PUBLISH: "page:publish",
  AUTH_MANAGE: "auth:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PLATFORM_ROLES = ["admin", "editor", "customer"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

const EDITOR_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.CONTENT_DRAFT_WRITE,
  PERMISSIONS.LAYOUT_DRAFT_WRITE,
  PERMISSIONS.PAGE_DRAFT_WRITE,
];

const CUSTOMER_PERMISSIONS: readonly PermissionKey[] = [PERMISSIONS.STOREFRONT_VIEW];

/** Platform-wide role → permission bundles (v1 — not per-org). */
export const ROLE_PERMISSIONS: Record<PlatformRole, readonly PermissionKey[]> = {
  admin: ALL_PERMISSIONS,
  editor: EDITOR_PERMISSIONS,
  customer: CUSTOMER_PERMISSIONS,
};

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** Expand known ZITADEL role keys into a deduplicated permission list. */
export function expandPermissions(roles: Iterable<PlatformRole>): PermissionKey[] {
  const out = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      out.add(permission);
    }
  }
  return [...out];
}

/** Expand raw role keys from JWT/userinfo (ignores unknown keys). */
export function expandPermissionsFromKeys(roleKeys: Iterable<string>): PermissionKey[] {
  const roles: PlatformRole[] = [];
  for (const key of roleKeys) {
    if (isPlatformRole(key)) roles.push(key);
  }
  return expandPermissions(roles);
}

export function hasPermission(
  permissions: Iterable<PermissionKey>,
  required: PermissionKey,
): boolean {
  for (const permission of permissions) {
    if (permission === required) return true;
  }
  return false;
}

/** Visual editor / ?edit=true — any draft_write capability. */
export function canDraft(roleKeys: Iterable<string>): boolean {
  const perms = expandPermissionsFromKeys(roleKeys);
  return (
    hasPermission(perms, PERMISSIONS.CONTENT_DRAFT_WRITE) ||
    hasPermission(perms, PERMISSIONS.LAYOUT_DRAFT_WRITE) ||
    hasPermission(perms, PERMISSIONS.PAGE_DRAFT_WRITE)
  );
}

/** Team surfaces: admin beats editor; null when no platform role. */
export function primaryTeamRole(roles: Iterable<PlatformRole>): PlatformRole | null {
  const set = new Set(roles);
  if (set.has("admin")) return "admin";
  if (set.has("editor")) return "editor";
  if (set.has("customer")) return "customer";
  return null;
}

/** Edge HMAC / legacy single role — defaults to customer when unprivileged. */
export function primaryRoleFromKeys(roleKeys: Iterable<string>): PlatformRole {
  const roles: PlatformRole[] = [];
  for (const key of roleKeys) {
    if (isPlatformRole(key)) roles.push(key);
  }
  return primaryTeamRole(roles) ?? "customer";
}
