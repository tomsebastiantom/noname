import { type FormEvent, useEffect, useState } from "react";
import { type AuthProvider, loadAuthSettings } from "../../auth/auth-settings";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { executeAction } from "../../platform/registry";
import type { ComponentCtx } from "./types";

const PROVIDER_LABELS: Record<AuthProvider, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
};

export function AuthSettingsForm({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
}>) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [allowPassword, setAllowPassword] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await loadAuthSettings();

        if (!cancelled) {
          setProviders(data.providers);
          setAllowPassword(data.allowPassword);
          setGoogleConfigured(data.googleConfigured);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleGoogle() {
    setProviders((current) =>
      current.includes("google") ? current.filter((p) => p !== "google") : [...current, "google"],
    );
    setSuccess(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const googleOAuth =
        providers.includes("google") && googleClientId.trim() && googleClientSecret.trim()
          ? { clientId: googleClientId.trim(), clientSecret: googleClientSecret.trim() }
          : undefined;

      await executeAction("saveAuthConfig", { providers, allowPassword, googleOAuth }, () => {});

      const data = await loadAuthSettings();
      setProviders(data.providers);
      setGoogleConfigured(data.googleConfigured);
      setGoogleClientSecret("");
      setSuccess("Auth settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading auth settings…</p>;
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description && <CardDescription>{props.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Social providers</legend>

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={providers.includes("google")}
                  onChange={toggleGoogle}
                  className="size-4 rounded border-input"
                />
                <span className="text-sm font-medium">{PROVIDER_LABELS.google}</span>
                {googleConfigured && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Configured in ZITADEL
                  </span>
                )}
              </label>
              {providers.includes("google") && (
                <div className="flex flex-col gap-3 pl-6">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="google-client-id">Google OAuth Client ID</Label>
                    <Input
                      id="google-client-id"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      placeholder="From Google Cloud Console"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="google-client-secret">Google OAuth Client Secret</Label>
                    <Input
                      id="google-client-secret"
                      type="password"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      placeholder={
                        googleConfigured
                          ? "Leave blank to keep existing secret"
                          : "From Google Cloud Console"
                      }
                      autoComplete="new-password"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save registers the provider in ZITADEL for this org and stores the IdP reference
                    in platform settings.
                  </p>
                </div>
              )}
            </div>

            {(["github", "apple"] as const).map((provider) => (
              <div
                key={provider}
                className="flex items-center gap-2 rounded-md border border-dashed p-3 opacity-60"
              >
                <input type="checkbox" disabled className="size-4 rounded border-input" />
                <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
                <span className="text-xs text-muted-foreground">Coming soon</span>
              </div>
            ))}
          </fieldset>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allowPassword}
              onChange={(e) => {
                setAllowPassword(e.target.checked);
                setSuccess(null);
              }}
              className="size-4 rounded border-input"
            />
            <span className="text-sm">Allow email and password sign-in</span>
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
