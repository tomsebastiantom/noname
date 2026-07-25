import { useEffect, useState } from "react";
import { loadOidcConfig } from "../../auth/config";
import { clearSession, hydrateTokenFromCookie, isLoggedIn } from "../../auth/session";
import { Button } from "../../components/ui/button";

function AuthBar({ onAuthChange }: Readonly<{ onAuthChange: () => void }>) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [oidcReady, setOidcReady] = useState<boolean | null>(null);
  const onLoginPage = window.location.pathname === "/login";

  useEffect(() => {
    hydrateTokenFromCookie();
    setLoggedIn(isLoggedIn());
    void loadOidcConfig().then((cfg) => setOidcReady(cfg !== null));
  }, []);

  if (onLoginPage || oidcReady === false) {
    return null;
  }

  return (
    <header className="flex items-center justify-end gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
      {loggedIn ? (
        <>
          <span className="text-muted-foreground">Signed in</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clearSession();
              setLoggedIn(false);
              onAuthChange();
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </>
      ) : (
        <a href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </a>
      )}
    </header>
  );
}

export { AuthBar };
