import { useEffect, useState } from "react";
import { loadOidcConfig } from "../../auth/config";
import { performLogout } from "../../auth/logout";
import { hydrateTokenFromCookie, isLoggedIn } from "../../auth/session";
import { fetchAuthSessionStatus, sessionCanDraft } from "../../auth/team-users";
import { Button } from "../../components/ui/button";

function editPageHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("edit", "true");
  return url.pathname + url.search + url.hash;
}

function AuthBar({ onAuthChange }: Readonly<{ onAuthChange: () => void }>) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [canDraft, setCanDraft] = useState(false);
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
      return;
    }
    void fetchAuthSessionStatus()
      .then((session) => setCanDraft(sessionCanDraft(session)))
      .catch(() => setCanDraft(false));
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
            <a
              href="/account/security"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Security
            </a>
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
