import { useActions } from "@json-render/react";
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
import type { ComponentCtx } from "../../core/components/types";

function cmsProviderEnabled(
  authProviders: Array<{ providerKey: AuthProvider; enabled: boolean }>,
  provider: AuthProvider,
): boolean {
  return authProviders.find((entry) => entry.providerKey === provider)?.enabled ?? false;
}

function cmsProviderName(
  authProviders: Array<{ providerKey: AuthProvider; name: string }>,
  provider: AuthProvider,
  fallback: string,
): string {
  return authProviders.find((entry) => entry.providerKey === provider)?.name ?? fallback;
}

function CredentialProviderSection({
  visible,
  configured,
  clientId,
  clientSecret,
  onClientIdChange,
  onClientSecretChange,
  idPrefix,
  secretPlaceholder,
  providerLabel,
  configuredBadgeLabel,
}: Readonly<{
  visible: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  idPrefix: string;
  secretPlaceholder: string;
  providerLabel: string;
  configuredBadgeLabel: string;
}>) {
  if (!visible) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{providerLabel}</span>
        {configured && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {configuredBadgeLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-client-id`}>{providerLabel} OAuth Client ID</Label>
        <Input
          id={`${idPrefix}-client-id`}
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-client-secret`}>{providerLabel} OAuth Client Secret</Label>
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
  );
}

export function AuthSettingsForm({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  saveLabel: string;
  savingLabel: string;
  loadingLabel: string;
  successMessage: string;
  socialProvidersLegend: string;
  configuredBadgeLabel: string;
  saveHelperText: string;
  authProvidersLinkText: string;
  allowPasswordLabel: string;
  allowPasswordResetLabel: string;
  allowSignUpLabel: string;
  adminSecurityLegend: string;
  requireMfaLabel: string;
  mfaHelperText: string;
  loginAppearanceLinkText: string;
  googleLabel: string;
  githubLabel: string;
  appleLabel: string;
  googleSecretPlaceholderNew: string;
  googleSecretPlaceholderExisting: string;
  githubSecretPlaceholderNew: string;
  githubSecretPlaceholderExisting: string;
  appleKeyPlaceholderNew: string;
  appleKeyPlaceholderExisting: string;
}>) {
  const { execute } = useActions();
  const fallbackLabels: Record<AuthProvider, string> = {
    google: props.googleLabel,
    github: props.githubLabel,
    apple: props.appleLabel,
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authProviders, setAuthProviders] = useState<
    Array<{ providerKey: AuthProvider; name: string; enabled: boolean }>
  >([]);
  const [allowPassword, setAllowPassword] = useState(true);
  const [allowSignUp, setAllowSignUp] = useState(false);
  const [allowPasswordReset, setAllowPasswordReset] = useState(true);
  const [requireMfaForAdmin, setRequireMfaForAdmin] = useState(false);
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
          setAuthProviders(data.authProviders);
          setAllowPassword(data.allowPassword);
          setAllowSignUp(data.allowSignUp);
          setAllowPasswordReset(data.allowPasswordReset);
          setRequireMfaForAdmin(data.requireMfaForAdmin);
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const googleOAuth =
        cmsProviderEnabled(authProviders, "google") &&
        googleClientId.trim() &&
        googleClientSecret.trim()
          ? { clientId: googleClientId.trim(), clientSecret: googleClientSecret.trim() }
          : undefined;
      const githubOAuth =
        cmsProviderEnabled(authProviders, "github") &&
        githubClientId.trim() &&
        githubClientSecret.trim()
          ? { clientId: githubClientId.trim(), clientSecret: githubClientSecret.trim() }
          : undefined;
      const appleOAuth =
        cmsProviderEnabled(authProviders, "apple") &&
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

      await execute({
        action: "saveAuthConfig",
        params: {
          allowPassword,
          allowSignUp,
          allowPasswordReset,
          requireMfaForAdmin,
          googleOAuth,
          githubOAuth,
          appleOAuth,
        },
      });

      const data = await loadAuthSettings();
      setAuthProviders(data.authProviders);
      setGoogleConfigured(data.googleConfigured);
      setGithubConfigured(data.githubConfigured);
      setAppleConfigured(data.appleConfigured);
      setGoogleClientSecret("");
      setGithubClientSecret("");
      setApplePrivateKey("");
      setSuccess(props.successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{props.loadingLabel}</p>;
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
            <legend className="text-sm font-medium">{props.socialProvidersLegend}</legend>

            <p className="text-sm text-muted-foreground">
              <a
                href="/admin/content/auth_provider"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {props.authProvidersLinkText}
              </a>
            </p>

            <CredentialProviderSection
              visible={cmsProviderEnabled(authProviders, "google")}
              configured={googleConfigured}
              clientId={googleClientId}
              clientSecret={googleClientSecret}
              onClientIdChange={setGoogleClientId}
              onClientSecretChange={setGoogleClientSecret}
              idPrefix="google"
              providerLabel={cmsProviderName(authProviders, "google", fallbackLabels.google)}
              configuredBadgeLabel={props.configuredBadgeLabel}
              secretPlaceholder={
                googleConfigured
                  ? props.googleSecretPlaceholderExisting
                  : props.googleSecretPlaceholderNew
              }
            />

            <CredentialProviderSection
              visible={cmsProviderEnabled(authProviders, "github")}
              configured={githubConfigured}
              clientId={githubClientId}
              clientSecret={githubClientSecret}
              onClientIdChange={setGithubClientId}
              onClientSecretChange={setGithubClientSecret}
              idPrefix="github"
              providerLabel={cmsProviderName(authProviders, "github", fallbackLabels.github)}
              configuredBadgeLabel={props.configuredBadgeLabel}
              secretPlaceholder={
                githubConfigured
                  ? props.githubSecretPlaceholderExisting
                  : props.githubSecretPlaceholderNew
              }
            />

            {cmsProviderEnabled(authProviders, "apple") && (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {cmsProviderName(authProviders, "apple", fallbackLabels.apple)}
                  </span>
                  {appleConfigured && (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {props.configuredBadgeLabel}
                    </span>
                  )}
                </div>
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
                        ? props.appleKeyPlaceholderExisting
                        : props.appleKeyPlaceholderNew
                    }
                    rows={4}
                    className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{props.saveHelperText}</p>
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
            <span className="text-sm">{props.allowPasswordLabel}</span>
          </label>

          {allowPassword && (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowPasswordReset}
                  onChange={(e) => {
                    setAllowPasswordReset(e.target.checked);
                    setSuccess(null);
                  }}
                  className="size-4 rounded border-input"
                />
                <span className="text-sm">{props.allowPasswordResetLabel}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowSignUp}
                  onChange={(e) => {
                    setAllowSignUp(e.target.checked);
                    setSuccess(null);
                  }}
                  className="size-4 rounded border-input"
                />
                <span className="text-sm">{props.allowSignUpLabel}</span>
              </label>
            </>
          )}

          <fieldset className="flex flex-col gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{props.adminSecurityLegend}</legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={requireMfaForAdmin}
                onChange={(e) => {
                  setRequireMfaForAdmin(e.target.checked);
                  setSuccess(null);
                }}
                className="size-4 rounded border-input"
              />
              <span className="text-sm">{props.requireMfaLabel}</span>
            </label>
            <p className="text-xs text-muted-foreground">{props.mfaHelperText}</p>
          </fieldset>

          <p className="text-sm text-muted-foreground">
            <a
              href="/admin/settings/login"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {props.loginAppearanceLinkText}
            </a>
          </p>

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
            {saving ? props.savingLabel : props.saveLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
