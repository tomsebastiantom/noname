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

function ClientSecretProviderSection({
  provider,
  enabled,
  configured,
  clientId,
  clientSecret,
  onToggle,
  onClientIdChange,
  onClientSecretChange,
  idPrefix,
  secretPlaceholder,
}: Readonly<{
  provider: "google" | "github";
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  onToggle: () => void;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  idPrefix: string;
  secretPlaceholder: string;
}>) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="size-4 rounded border-input"
        />
        <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
        {configured && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Configured in ZITADEL
          </span>
        )}
      </label>
      {enabled && (
        <div className="flex flex-col gap-3 pl-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-client-id`}>
              {PROVIDER_LABELS[provider]} OAuth Client ID
            </Label>
            <Input
              id={`${idPrefix}-client-id`}
              value={clientId}
              onChange={(e) => onClientIdChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-client-secret`}>
              {PROVIDER_LABELS[provider]} OAuth Client Secret
            </Label>
            <Input
              id={`${idPrefix}-client-secret`}
              type="password"
              value={clientSecret}
              onChange={(e) => onClientSecretChange(e.target.value)}
              placeholder={secretPlaceholder}
              autoComplete="new-password"
            />
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [appleConfigured, setAppleConfigured] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [appleClientId, setAppleClientId] = useState("");
  const [appleTeamId, setAppleTeamId] = useState("");
  const [appleKeyId, setAppleKeyId] = useState("");
  const [applePrivateKey, setApplePrivateKey] = useState("");

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
          setGithubConfigured(data.githubConfigured);
          setAppleConfigured(data.appleConfigured);
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

  function toggleProvider(provider: AuthProvider) {
    setProviders((current) =>
      current.includes(provider) ? current.filter((p) => p !== provider) : [...current, provider],
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
      const githubOAuth =
        providers.includes("github") && githubClientId.trim() && githubClientSecret.trim()
          ? { clientId: githubClientId.trim(), clientSecret: githubClientSecret.trim() }
          : undefined;
      const appleOAuth =
        providers.includes("apple") &&
        appleClientId.trim() &&
        appleTeamId.trim() &&
        appleKeyId.trim() &&
        applePrivateKey.trim()
          ? {
              clientId: appleClientId.trim(),
              teamId: appleTeamId.trim(),
              keyId: appleKeyId.trim(),
              privateKey: applePrivateKey.trim(),
            }
          : undefined;

      await executeAction(
        "saveAuthConfig",
        { providers, allowPassword, googleOAuth, githubOAuth, appleOAuth },
        () => {},
      );

      const data = await loadAuthSettings();
      setProviders(data.providers);
      setGoogleConfigured(data.googleConfigured);
      setGithubConfigured(data.githubConfigured);
      setAppleConfigured(data.appleConfigured);
      setGoogleClientSecret("");
      setGithubClientSecret("");
      setApplePrivateKey("");
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

            <ClientSecretProviderSection
              provider="google"
              enabled={providers.includes("google")}
              configured={googleConfigured}
              clientId={googleClientId}
              clientSecret={googleClientSecret}
              onToggle={() => toggleProvider("google")}
              onClientIdChange={setGoogleClientId}
              onClientSecretChange={setGoogleClientSecret}
              idPrefix="google"
              secretPlaceholder={
                googleConfigured
                  ? "Leave blank to keep existing secret"
                  : "From Google Cloud Console"
              }
            />

            <ClientSecretProviderSection
              provider="github"
              enabled={providers.includes("github")}
              configured={githubConfigured}
              clientId={githubClientId}
              clientSecret={githubClientSecret}
              onToggle={() => toggleProvider("github")}
              onClientIdChange={setGithubClientId}
              onClientSecretChange={setGithubClientSecret}
              idPrefix="github"
              secretPlaceholder={
                githubConfigured ? "Leave blank to keep existing secret" : "From GitHub OAuth app"
              }
            />

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={providers.includes("apple")}
                  onChange={() => toggleProvider("apple")}
                  className="size-4 rounded border-input"
                />
                <span className="text-sm font-medium">{PROVIDER_LABELS.apple}</span>
                {appleConfigured && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Configured in ZITADEL
                  </span>
                )}
              </label>
              {providers.includes("apple") && (
                <div className="flex flex-col gap-3 pl-6">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="apple-client-id">Apple Services ID</Label>
                    <Input
                      id="apple-client-id"
                      value={appleClientId}
                      onChange={(e) => setAppleClientId(e.target.value)}
                      placeholder="com.example.web"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="apple-team-id">Apple Team ID</Label>
                    <Input
                      id="apple-team-id"
                      value={appleTeamId}
                      onChange={(e) => setAppleTeamId(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="apple-key-id">Apple Key ID</Label>
                    <Input
                      id="apple-key-id"
                      value={appleKeyId}
                      onChange={(e) => setAppleKeyId(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="apple-private-key">Apple Sign In private key (.p8)</Label>
                    <textarea
                      id="apple-private-key"
                      value={applePrivateKey}
                      onChange={(e) => setApplePrivateKey(e.target.value)}
                      placeholder={
                        appleConfigured
                          ? "Leave blank to keep existing key"
                          : "Paste contents of AuthKey_XXXX.p8"
                      }
                      rows={4}
                      className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Save registers providers in ZITADEL for this org and stores IdP references in platform
              settings. Secrets are never returned to the browser after save.
            </p>
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
