import { useEffect, useState } from "react";
import { completeOAuthCallback } from "./idp-login";

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      setError("Missing authorization code");
      return;
    }

    void completeOAuthCallback(code)
      .then((redirectPath) => {
        window.location.href = redirectPath || "/";
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return (
      <div className="noname-auth flex min-h-screen flex-col items-center justify-center p-6">
        <p className="max-w-md text-center text-destructive">{error}</p>
        <a href="/login" className="mt-4 text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="noname-auth flex min-h-screen items-center justify-center p-6 text-muted-foreground">
      Completing sign-in…
    </div>
  );
}
