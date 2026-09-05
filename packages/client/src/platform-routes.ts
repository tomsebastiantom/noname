/** Fixed platform URLs — not merchant page_tree. See docs/2026-07-25/PAGE-ROUTING.md */
import type { AccountRouteId } from "./auth/account-routes";
import type { AdminRouteId } from "./auth/admin-routes";

export type PlatformRoute = {
  kind: "platform";
  template: string;
  requiresAuth: boolean;
};

export type StorefrontRoute = {
  kind: "storefront";
};

export type AppRoute = PlatformRoute | StorefrontRoute;

export interface PlatformRouteEntry {
  /** Exact path, or prefix when `prefix` is true. */
  path: string;
  prefix?: boolean;
  template: string;
  requiresAuth: boolean;
  adminRouteId?: AdminRouteId;
  accountRouteId?: AccountRouteId;
  /** Sidebar/nav highlight id — defaults to adminRouteId. */
  navId?: string;
}

/**
 * Single route table. All matchers below scan longest-path-first, replacing the
 * four hand-maintained prefix chains that drifted apart. Admin access rules stay
 * in `auth/admin-routes.ts`, account nav in `auth/account-routes.ts` — their
 * PATHS records derive from this table.
 */
export const ROUTE_TABLE: readonly PlatformRouteEntry[] = [
  { path: "/login", template: "login", requiresAuth: false },
  { path: "/auth/callback", template: "login", requiresAuth: false },
  {
    path: "/account/communication-preferences",
    prefix: true,
    template: "account_communication_preferences",
    requiresAuth: true,
    accountRouteId: "preferences",
    navId: "account_communication_preferences",
  },
  {
    path: "/account/notifications",
    prefix: true,
    template: "account_notifications",
    requiresAuth: true,
    accountRouteId: "notifications",
    navId: "account_notifications",
  },
  {
    path: "/account/security",
    prefix: true,
    template: "account_security",
    requiresAuth: true,
    accountRouteId: "security",
    navId: "account_security",
  },
  {
    path: "/admin/settings/security",
    template: "admin_account_security",
    requiresAuth: true,
    navId: "account_security",
  },
  { path: "/admin/content", prefix: true, template: "admin_content", requiresAuth: true, adminRouteId: "content" },
  { path: "/admin/layout", prefix: true, template: "admin_layout", requiresAuth: true, adminRouteId: "layout" },
  { path: "/admin/pages/tree", prefix: true, template: "admin_pages_tree", requiresAuth: true, adminRouteId: "pages" },
  { path: "/admin/pages", prefix: true, template: "admin_pages", requiresAuth: true, adminRouteId: "pages" },
  { path: "/admin/settings/login", template: "admin_login", requiresAuth: true, adminRouteId: "login" },
  { path: "/admin/settings/auth", template: "admin_dashboard", requiresAuth: true, adminRouteId: "auth" },
  {
    path: "/admin/settings/integrations",
    template: "admin_integrations",
    requiresAuth: true,
    adminRouteId: "integrations",
  },
  { path: "/admin/settings/users", template: "admin_users", requiresAuth: true, adminRouteId: "users" },
  { path: "/admin/settings/scope", template: "admin_scope", requiresAuth: true, adminRouteId: "scope" },
  { path: "/admin/settings/analytics", template: "admin_analytics", requiresAuth: true, adminRouteId: "analytics" },
  { path: "/admin/settings/flags", template: "admin_flags", requiresAuth: true, adminRouteId: "flags" },
  { path: "/admin/settings/replay", template: "admin_replay", requiresAuth: true, adminRouteId: "replay" },
  { path: "/admin/settings/traces", template: "admin_traces", requiresAuth: true, adminRouteId: "traces" },
  { path: "/admin/settings/agents", template: "admin_agents", requiresAuth: true, adminRouteId: "agents" },
  { path: "/admin", template: "admin_home", requiresAuth: true, adminRouteId: "home" },
  { path: "/admin/", template: "admin_home", requiresAuth: true, adminRouteId: "home" },
  { path: "/admin", prefix: true, template: "admin_home", requiresAuth: true, adminRouteId: "home" },
  { path: "/account", prefix: true, template: "admin_home", requiresAuth: true },
];

const SORTED_ROUTES = [...ROUTE_TABLE].sort((a, b) => b.path.length - a.path.length);

function matchRoute(pathname: string): PlatformRouteEntry | null {
  for (const entry of SORTED_ROUTES) {
    if (entry.prefix) {
      if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) return entry;
      // Preserve legacy startsWith semantics for prefix entries (e.g. /admin/*).
      if (entry.path === "/admin" && pathname.startsWith("/admin")) return entry;
      if (entry.path === "/account" && pathname.startsWith("/account")) return entry;
    } else if (pathname === entry.path) {
      return entry;
    }
  }
  return null;
}

export function isPlatformPath(pathname: string): boolean {
  return matchRoute(pathname) !== null;
}

/** Map platform pathname → layout template. Call only when isPlatformPath is true. */
export function platformTemplateFromPath(pathname: string): string {
  return matchRoute(pathname)?.template ?? "admin_home";
}

export function isAdminTemplate(template: string): boolean {
  return template.startsWith("admin_") && template !== "admin_shell";
}

export function isLoginTemplate(template: string): boolean {
  return template === "login";
}

export function requiresAuthPath(pathname: string): boolean {
  return matchRoute(pathname)?.requiresAuth ?? false;
}

export function resolveRoute(pathname: string): AppRoute {
  if (!isPlatformPath(pathname)) {
    return { kind: "storefront" };
  }
  const template = platformTemplateFromPath(pathname);
  return {
    kind: "platform",
    template,
    requiresAuth: requiresAuthPath(pathname),
  };
}

/** Sidebar highlight for AdminNav — derived from URL so SPA nav stays correct between spec swaps. */
export function adminActiveNavFromPath(pathname: string): string {
  const entry = matchRoute(pathname);
  if (!entry) return "";
  return entry.navId ?? entry.adminRouteId ?? "";
}
