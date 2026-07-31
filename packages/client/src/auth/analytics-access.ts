import { useEffect, useState } from "react";
import { isLoggedIn } from "./session";
import { fetchAuthSessionStatus, PERMISSIONS, sessionHasPermission } from "./team-users";

export const REPLAY_ADMIN_PATH = "/admin/settings/replay";

/** null while loading session permissions. */
export function useAnalyticsViewPermission(): boolean | null {
  const loggedIn = isLoggedIn();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loggedIn) {
      setAllowed(false);
      return;
    }
    void fetchAuthSessionStatus()
      .then((session) => setAllowed(sessionHasPermission(session, PERMISSIONS.ANALYTICS_VIEW)))
      .catch(() => setAllowed(false));
  }, [loggedIn]);

  return allowed;
}

export function isReplayAdminLink(href: string): boolean {
  return href.includes(REPLAY_ADMIN_PATH);
}
