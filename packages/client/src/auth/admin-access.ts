import { useEffect, useState } from "react";
import {
  ADMIN_ROUTE_PATHS,
  type AdminRouteId,
  adminNavItemVisible,
  canAccessAdminRoute,
} from "./admin-routes";
import { isLoggedIn } from "./session";
import type { AuthSessionStatus } from "./team-users";
import { fetchAuthSessionStatus } from "./team-users";

export type { AdminRouteId } from "./admin-routes";
export {
  ADMIN_ROUTE_ACCESS,
  ADMIN_ROUTE_PATHS,
  adminNavItemVisible,
  adminRouteIdFromHref,
  adminRouteVisibleWhileLoading,
  canAccessAdminRoute,
  hasStaffAdminAccess,
  isAdminRouteId,
  OBSERVABILITY_ROUTE_IDS,
} from "./admin-routes";

export const ANALYTICS_ADMIN_PATH = ADMIN_ROUTE_PATHS.analytics;
export const REPLAY_ADMIN_PATH = ADMIN_ROUTE_PATHS.replay;
export const FLAGS_ADMIN_PATH = ADMIN_ROUTE_PATHS.flags;

/** Session + permissions for admin route checks. */
export function useAdminSession(): {
  loading: boolean;
  session: AuthSessionStatus | null;
} {
  const loggedIn = isLoggedIn();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSessionStatus | null>(null);

  useEffect(() => {
    if (!loggedIn) {
      setSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = () => {
      setLoading(true);
      void fetchAuthSessionStatus()
        .then((data) => {
          if (cancelled) return;
          setSession(data);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setSession(null);
          setLoading(false);
        });
    };

    load();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loggedIn]);

  return { loading, session };
}

/** null while loading session permissions. */
export function useAdminRouteAccess(routeId: AdminRouteId): boolean | null {
  const { loading, session } = useAdminSession();
  if (loading) return null;
  return canAccessAdminRoute(session, routeId);
}

/** Filter sidebar nav items (top + settings) from admin-routes. */
export function useAdminNavVisibility(): {
  loading: boolean;
  canAccessNavItem: (routeId: string) => boolean;
} {
  const { loading, session } = useAdminSession();
  return {
    loading,
    canAccessNavItem: (routeId: string) => adminNavItemVisible(routeId, session, loading),
  };
}

/** @deprecated Prefer useAdminRouteAccess("analytics") */
export function useAnalyticsViewPermission(): boolean | null {
  return useAdminRouteAccess("analytics");
}

/** @deprecated Prefer useAdminRouteAccess("replay") */
export function useSessionReplayPermission(): boolean | null {
  return useAdminRouteAccess("replay");
}

/** @deprecated Prefer useAdminRouteAccess("flags") */
export function useFlagsWritePermission(): boolean | null {
  return useAdminRouteAccess("flags");
}

/** @deprecated Prefer useAdminRouteAccess("auth") */
export function useAuthManagePermission(): boolean | null {
  return useAdminRouteAccess("auth");
}

/** @deprecated Prefer useAdminRouteAccess("scope") or useAdminRouteAccess("users") */
export function useScopeAdminPermission(): boolean | null {
  return useAdminRouteAccess("scope");
}

export function isAnalyticsAdminLink(href: string): boolean {
  return href.includes(ANALYTICS_ADMIN_PATH);
}

export function isReplayAdminLink(href: string): boolean {
  return href.includes(REPLAY_ADMIN_PATH);
}

export function isFlagsAdminLink(href: string): boolean {
  return href.includes(FLAGS_ADMIN_PATH);
}

export function isScopeAdminLink(href: string): boolean {
  return href.includes(ADMIN_ROUTE_PATHS.scope);
}

export function isUsersAdminLink(href: string): boolean {
  return href.includes(ADMIN_ROUTE_PATHS.users);
}

export function isAuthAdminLink(href: string): boolean {
  return href.includes(ADMIN_ROUTE_PATHS.auth);
}

export function isLoginAdminLink(href: string): boolean {
  return href.includes(ADMIN_ROUTE_PATHS.login);
}
