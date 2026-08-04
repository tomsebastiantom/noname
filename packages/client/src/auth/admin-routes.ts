import { PERMISSIONS } from "@noname/auth";
import type { AuthSessionStatus } from "./team-users";
import { sessionHasPermission } from "./team-users";

/** Admin sidebar / settings route ids — must match seed nav `item.id` values. */
export type AdminRouteId =
  | "home"
  | "pages"
  | "content"
  | "layout"
  | "auth"
  | "integrations"
  | "login"
  | "users"
  | "scope"
  | "analytics"
  | "flags"
  | "replay"
  | "traces"
  | "agents";

type AccessRule = (session: AuthSessionStatus) => boolean;

/** Single source: admin route → who may access it (UX mirror of server permissions). */
export const ADMIN_ROUTE_ACCESS: Record<AdminRouteId, AccessRule> = {
  home: (s) => hasStaffAdminAccess(s),
  pages: (s) => sessionHasPermission(s, PERMISSIONS.PAGE_DRAFT_WRITE),
  content: (s) => sessionHasPermission(s, PERMISSIONS.CONTENT_DRAFT_WRITE),
  layout: (s) => sessionHasPermission(s, PERMISSIONS.LAYOUT_DRAFT_WRITE),
  auth: (s) => sessionHasPermission(s, PERMISSIONS.AUTH_MANAGE),
  integrations: (s) => sessionHasPermission(s, PERMISSIONS.INTEGRATIONS_MANAGE),
  login: (s) => sessionHasPermission(s, PERMISSIONS.AUTH_MANAGE),
  users: (s) =>
    sessionHasPermission(s, PERMISSIONS.AUTH_MANAGE) ||
    sessionHasPermission(s, PERMISSIONS.SCOPE_MANAGE),
  scope: (s) =>
    sessionHasPermission(s, PERMISSIONS.AUTH_MANAGE) ||
    sessionHasPermission(s, PERMISSIONS.SCOPE_MANAGE),
  analytics: (s) => sessionHasPermission(s, PERMISSIONS.ANALYTICS_VIEW),
  flags: (s) => sessionHasPermission(s, PERMISSIONS.FLAGS_WRITE),
  replay: (s) => sessionHasPermission(s, PERMISSIONS.SESSION_REPLAY),
  traces: (s) => sessionHasPermission(s, PERMISSIONS.TRACES_VIEW),
  agents: (s) =>
    sessionHasPermission(s, PERMISSIONS.CONTENT_DRAFT_WRITE) ||
    sessionHasPermission(s, PERMISSIONS.AGENT_MANAGE),
};

export const ADMIN_ROUTE_PATHS: Record<AdminRouteId, string> = {
  home: "/admin",
  pages: "/admin/pages",
  content: "/admin/content",
  layout: "/admin/layout",
  auth: "/admin/settings/auth",
  integrations: "/admin/settings/integrations",
  login: "/admin/settings/login",
  users: "/admin/settings/users",
  scope: "/admin/settings/scope",
  analytics: "/admin/settings/analytics",
  flags: "/admin/settings/flags",
  replay: "/admin/settings/replay",
  traces: "/admin/settings/traces",
  agents: "/admin/settings/agents",
};

const PATH_ENTRIES = (Object.entries(ADMIN_ROUTE_PATHS) as [AdminRouteId, string][]).sort(
  (a, b) => b[1].length - a[1].length,
);

export function isAdminRouteId(value: string): value is AdminRouteId {
  return value in ADMIN_ROUTE_ACCESS;
}

export function canAccessAdminRoute(
  session: AuthSessionStatus | null | undefined,
  routeId: AdminRouteId,
): boolean {
  if (!session) return false;
  return ADMIN_ROUTE_ACCESS[routeId](session);
}

/** True when the session may use any admin surface (not storefront-only customer). */
export function hasStaffAdminAccess(session: AuthSessionStatus | null | undefined): boolean {
  if (!session) return false;
  return (Object.keys(ADMIN_ROUTE_ACCESS) as AdminRouteId[]).some(
    (id) => id !== "home" && canAccessAdminRoute(session, id),
  );
}

export const OBSERVABILITY_ROUTE_IDS: readonly AdminRouteId[] = [
  "analytics",
  "flags",
  "replay",
  "traces",
];

/** Map an admin href to a route id (longest path match). */
export function adminRouteIdFromHref(href: string): AdminRouteId | null {
  for (const [id, path] of PATH_ENTRIES) {
    if (path === "/admin") {
      if (href === "/admin" || href === "/admin/") return "home";
      continue;
    }
    if (href === path || href.startsWith(`${path}/`)) return id;
  }
  return null;
}

/** Routes visible before session permissions finish loading. */
export function adminRouteVisibleWhileLoading(routeId: AdminRouteId): boolean {
  if (routeId === "home") return true;
  return (
    routeId !== "replay" &&
    routeId !== "flags" &&
    routeId !== "analytics" &&
    routeId !== "traces" &&
    routeId !== "login" &&
    routeId !== "auth"
  );
}

export function adminNavItemVisible(
  routeId: string,
  session: AuthSessionStatus | null,
  loading: boolean,
): boolean {
  if (!isAdminRouteId(routeId)) return true;
  if (loading) return adminRouteVisibleWhileLoading(routeId);
  return canAccessAdminRoute(session, routeId);
}
