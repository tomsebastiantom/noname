import { useEffect, useState } from "react";
import { ACCOUNT_NAV_LINKS, accountNavLinkVisible } from "../../auth/account-routes";
import { loadOidcConfig } from "../../auth/config";
import { performLogout } from "../../auth/logout";
import { hydrateTokenFromCookie, isLoggedIn } from "../../auth/session";
import {
  type AuthSessionStatus,
  fetchAuthSessionStatus,
  sessionCanDraft,
} from "../../auth/team-users";
import { Button } from "../../components/ui/button";

function editPageHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("edit", "true");
  return url.pathname + url.search + url.hash;
}

function AuthBar({ onAuthChange }: Readonly<{ onAuthChange: () => void }>) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [canDraft, setCanDraft] = useState(false);
  const [session, setSession] = useState<AuthSessionStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [oidcReady, setOidcReady] = useState<boolean | null>(null);
  const onLoginPage = window.location.pathname === "/login";
  const inEditMode = new URLSearchParams(window.location.search).get("edit") === "true";

  useEffect(() => {
    hydrateTokenFromCookie();
    setLoggedIn(isLoggedIn());
    void loadOidcConfig().then((cfg) => setOidcReady(cfg !== null));
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      setCanDraft(false);
      setSession(null);
      setSessionLoading(false);
      return;
    }
    setSessionLoading(true);
    void fetchAuthSessionStatus()
      .then((data) => {
        setSession(data);
        setCanDraft(sessionCanDraft(data));
      })
      .catch(() => {
        setSession(null);
        setCanDraft(false);
      })
      .finally(() => setSessionLoading(false));
  }, [loggedIn]);

  if (onLoginPage || oidcReady === false) {
    return null;
  }

  function signOut() {
    setLoggedIn(false);
    setCanDraft(false);
    onAuthChange();
    performLogout();
  }

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        {canDraft && !inEditMode ? (
          <a
            href={editPageHref()}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Edit page
          </a>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {loggedIn ? (
          <>
            {ACCOUNT_NAV_LINKS.map((link) =>
              accountNavLinkVisible(link.id, session, sessionLoading) ? (
                <a
                  key={link.id}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {link.label}
                </a>
              ) : null,
            )}
            <span className="text-muted-foreground">Signed in</span>
            <Button type="button" variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </>
        ) : (
          <a
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}

export { AuthBar };
