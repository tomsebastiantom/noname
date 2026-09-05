import { ROUTE_TABLE } from "../platform-routes";
import type { AuthSessionStatus } from "./team-users";

/**
 * Storefront account platform routes — personal user settings, not org admin.
 *
 * | Surface | Who | API gate |
 * |---------|-----|----------|
 * | `/account/communication-preferences` | Any signed-in user | `requireAuthenticatedUser` |
 * | `/account/notifications` | Any signed-in user | `requireAuthenticatedUser` (own inbox rows) |
 * | `/account/security` | Any signed-in user | `requireAuthenticatedUser` |
 *
 * Org-level comms (provider config, delivery log, webhooks) live under
 * `/admin/settings/integrations` and require `integrations:manage`.
 */
export type AccountRouteId = "preferences" | "notifications" | "security";

/** Derived from ROUTE_TABLE — add the route there, not here. */
export const ACCOUNT_ROUTE_PATHS: Record<AccountRouteId, string> = (() => {
  const paths = {} as Record<AccountRouteId, string>;
  for (const entry of ROUTE_TABLE) {
    if (entry.accountRouteId && !(entry.accountRouteId in paths)) {
      paths[entry.accountRouteId] = entry.path;
    }
  }
  return paths;
})();

export type AccountNavLink = {
  id: AccountRouteId;
  href: string;
  label: string;
};

/** AuthBar + account nav — mirrors admin-routes pattern for storefront account pages. */
export const ACCOUNT_NAV_LINKS: readonly AccountNavLink[] = [
  { id: "preferences", href: ACCOUNT_ROUTE_PATHS.preferences, label: "Preferences" },
  { id: "notifications", href: ACCOUNT_ROUTE_PATHS.notifications, label: "Notifications" },
  { id: "security", href: ACCOUNT_ROUTE_PATHS.security, label: "Security" },
];

export function canAccessAccountRoute(
  session: AuthSessionStatus | null | undefined,
  _routeId: AccountRouteId,
): boolean {
  return Boolean(session?.userId);
}

export function accountNavLinkVisible(
  routeId: AccountRouteId,
  session: AuthSessionStatus | null,
  loading: boolean,
): boolean {
  if (loading) return true;
  return canAccessAccountRoute(session, routeId);
}
