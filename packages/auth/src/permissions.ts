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
 *
 * Canonical spec: docs/2026-08-03/ACCESS-AND-ROLES.md
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
  /** Tags, teams, Keto bindings, user invite (all roles except admin). */
  SCOPE_MANAGE: "scope:manage",
  /** Events, dashboards, funnels. */
  ANALYTICS_VIEW: "analytics:view",
  /** Watch rrweb session replays (PII — separate from analytics). */
  SESSION_REPLAY: "session:replay",
  /** Distributed traces (OpenTelemetry / Jaeger proxy). */
  TRACES_VIEW: "traces:view",
  FLAGS_WRITE: "flags:write",
  TENANT_MANAGE: "tenant:manage",
  AGENT_MANAGE: "agent:manage",
  MACHINES_DEFINE: "machines:define",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PLATFORM_ROLES = [
  "admin",
  "access_manager",
  "publisher",
  "editor",
  "analyst",
  "replay_viewer",
  "flags_manager",
  "trace_viewer",
  "customer",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Org team roles — every platform role except storefront-only customer. */
export type StaffRole = Exclude<PlatformRole, "customer">;

export const STAFF_ROLES = PLATFORM_ROLES.filter((role): role is StaffRole => role !== "customer");

const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

const DRAFT_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.CONTENT_DRAFT_WRITE,
  PERMISSIONS.LAYOUT_DRAFT_WRITE,
  PERMISSIONS.PAGE_DRAFT_WRITE,
];

const PUBLISH_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.CONTENT_PUBLISH,
  PERMISSIONS.LAYOUT_PUBLISH,
  PERMISSIONS.PAGE_PUBLISH,
];

const EDITOR_PERMISSIONS: readonly PermissionKey[] = DRAFT_PERMISSIONS;

const PUBLISHER_PERMISSIONS: readonly PermissionKey[] = [
  ...DRAFT_PERMISSIONS,
  ...PUBLISH_PERMISSIONS,
];

const ACCESS_MANAGER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.SCOPE_MANAGE,
];

const ANALYST_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.ANALYTICS_VIEW,
];

const REPLAY_VIEWER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.SESSION_REPLAY,
];

const FLAGS_MANAGER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.FLAGS_WRITE,
];

const TRACE_VIEWER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.TRACES_VIEW,
];

const CUSTOMER_PERMISSIONS: readonly PermissionKey[] = [PERMISSIONS.STOREFRONT_VIEW];

/** Platform-wide role → permission bundles. */
export const ROLE_PERMISSIONS: Record<PlatformRole, readonly PermissionKey[]> = {
  admin: ALL_PERMISSIONS,
  access_manager: ACCESS_MANAGER_PERMISSIONS,
  publisher: PUBLISHER_PERMISSIONS,
  editor: EDITOR_PERMISSIONS,
  analyst: ANALYST_PERMISSIONS,
  replay_viewer: REPLAY_VIEWER_PERMISSIONS,
  flags_manager: FLAGS_MANAGER_PERMISSIONS,
  trace_viewer: TRACE_VIEWER_PERMISSIONS,
  customer: CUSTOMER_PERMISSIONS,
};

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isStaffRole(value: string): value is StaffRole {
  return isPlatformRole(value) && value !== "customer";
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

/** Visual editor / ?edit=true — any draft_write capability (from expanded permissions). */
export function canDraftFromPermissions(permissions: Iterable<string>): boolean {
  const perms = permissions as PermissionKey[];
  return (
    hasPermission(perms, PERMISSIONS.CONTENT_DRAFT_WRITE) ||
    hasPermission(perms, PERMISSIONS.LAYOUT_DRAFT_WRITE) ||
    hasPermission(perms, PERMISSIONS.PAGE_DRAFT_WRITE)
  );
}

/** Visual editor / ?edit=true — any draft_write capability. */
export function canDraft(roleKeys: Iterable<string>): boolean {
  return canDraftFromPermissions(expandPermissionsFromKeys(roleKeys));
}

/** Staff UI: highest-privilege content/admin role for display. */
export function primaryTeamRole(roles: Iterable<PlatformRole>): PlatformRole | null {
  const set = new Set(roles);
  if (set.has("admin")) return "admin";
  if (set.has("access_manager")) return "access_manager";
  if (set.has("publisher")) return "publisher";
  if (set.has("editor")) return "editor";
  if (set.has("analyst")) return "analyst";
  if (set.has("replay_viewer")) return "replay_viewer";
  if (set.has("flags_manager")) return "flags_manager";
  if (set.has("trace_viewer")) return "trace_viewer";
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
