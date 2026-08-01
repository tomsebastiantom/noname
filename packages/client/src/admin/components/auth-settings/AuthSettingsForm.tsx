import { useStateValue } from "@json-render/react";
import { useState } from "react";
import type { AuthProvider } from "../../../auth/auth-settings";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { AuthSettingsLoaded } from "../../../core/actions/auth";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { AuthAppleProviderSection } from "./apple-provider-section";
import { AuthCredentialProviderSection } from "./credential-provider-section";
import { cmsProviderEnabled, cmsProviderName } from "./form-utils";
import { AuthSettingsMfaSection } from "./mfa-section";
import { AuthSettingsPasswordSection } from "./password-section";

type AuthSettingsConfig = Record<string, never>;

type AuthSettingsLabels = {
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
};

type AuthSettingsFormProps = ComponentCtx<CatalogProps<AuthSettingsConfig, AuthSettingsLabels>>;

function AuthSettingsFields({
  loaded,
  labels,
  loadError,
}: {
  loaded: AuthSettingsLoaded;
  labels: AuthSettingsLabels;
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, clearSuccess } = catalog;

  const fallbackLabels: Record<AuthProvider, string> = {
    google: labels.googleLabel,
    github: labels.githubLabel,
    apple: labels.appleLabel,
  };
  const [authProviders] = useState(loaded.authProviders);
  const [allowPassword, setAllowPassword] = useState(loaded.allowPassword);
  const [allowSignUp, setAllowSignUp] = useState(loaded.allowSignUp);
  const [allowPasswordReset, setAllowPasswordReset] = useState(loaded.allowPasswordReset);
  const [requireMfaForAdmin, setRequireMfaForAdmin] = useState(loaded.requireMfaForAdmin);
  const [googleConfigured] = useState(loaded.googleConfigured);
  const [githubConfigured] = useState(loaded.githubConfigured);
  const [appleConfigured] = useState(loaded.appleConfigured);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [appleClientId, setAppleClientId] = useState("");
  const [appleTeamId, setAppleTeamId] = useState("");
  const [appleKeyId, setAppleKeyId] = useState("");
  const [applePrivateKey, setApplePrivateKey] = useState("");

  async function handleSubmit() {
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

    await submit({
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
      successMessage: labels.successMessage,
      onSuccess: () => {
        setGoogleClientSecret("");
        setGithubClientSecret("");
        setApplePrivateKey("");
      },
    });
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{labels.socialProvidersLegend}</legend>

        <p className="text-sm text-muted-foreground">
          <a
            href="/admin/content/auth_provider"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {labels.authProvidersLinkText}
          </a>
        </p>

        <AuthCredentialProviderSection
          visible={cmsProviderEnabled(authProviders, "google")}
          configured={googleConfigured}
          clientId={googleClientId}
          clientSecret={googleClientSecret}
          onClientIdChange={setGoogleClientId}
          onClientSecretChange={setGoogleClientSecret}
          idPrefix="google"
          providerLabel={cmsProviderName(authProviders, "google", fallbackLabels.google)}
          configuredBadgeLabel={labels.configuredBadgeLabel}
          secretPlaceholder={
            googleConfigured
              ? labels.googleSecretPlaceholderExisting
              : labels.googleSecretPlaceholderNew
          }
        />

        <AuthCredentialProviderSection
          visible={cmsProviderEnabled(authProviders, "github")}
          configured={githubConfigured}
          clientId={githubClientId}
          clientSecret={githubClientSecret}
          onClientIdChange={setGithubClientId}
          onClientSecretChange={setGithubClientSecret}
          idPrefix="github"
          providerLabel={cmsProviderName(authProviders, "github", fallbackLabels.github)}
          configuredBadgeLabel={labels.configuredBadgeLabel}
          secretPlaceholder={
            githubConfigured
              ? labels.githubSecretPlaceholderExisting
              : labels.githubSecretPlaceholderNew
          }
        />

        <AuthAppleProviderSection
          visible={cmsProviderEnabled(authProviders, "apple")}
          configured={appleConfigured}
          providerLabel={cmsProviderName(authProviders, "apple", fallbackLabels.apple)}
          configuredBadgeLabel={labels.configuredBadgeLabel}
          clientId={appleClientId}
          teamId={appleTeamId}
          keyId={appleKeyId}
          privateKey={applePrivateKey}
          keyPlaceholder={
            appleConfigured ? labels.appleKeyPlaceholderExisting : labels.appleKeyPlaceholderNew
          }
          onClientIdChange={setAppleClientId}
          onTeamIdChange={setAppleTeamId}
          onKeyIdChange={setAppleKeyId}
          onPrivateKeyChange={setApplePrivateKey}
        />

        <p className="text-xs text-muted-foreground">{labels.saveHelperText}</p>
      </fieldset>

      <AuthSettingsPasswordSection
        allowPassword={allowPassword}
        allowPasswordReset={allowPasswordReset}
        allowSignUp={allowSignUp}
        allowPasswordLabel={labels.allowPasswordLabel}
        allowPasswordResetLabel={labels.allowPasswordResetLabel}
        allowSignUpLabel={labels.allowSignUpLabel}
        onAllowPasswordChange={(value) => {
          setAllowPassword(value);
          clearSuccess();
        }}
        onAllowPasswordResetChange={(value) => {
          setAllowPasswordReset(value);
          clearSuccess();
        }}
        onAllowSignUpChange={(value) => {
          setAllowSignUp(value);
          clearSuccess();
        }}
      />

      <AuthSettingsMfaSection
        requireMfaForAdmin={requireMfaForAdmin}
        adminSecurityLegend={labels.adminSecurityLegend}
        requireMfaLabel={labels.requireMfaLabel}
        mfaHelperText={labels.mfaHelperText}
        onRequireMfaChange={(value) => {
          setRequireMfaForAdmin(value);
          clearSuccess();
        }}
      />

      <p className="text-sm text-muted-foreground">
        <a
          href="/admin/settings/login"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {labels.loginAppearanceLinkText}
        </a>
      </p>

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? labels.savingLabel : labels.saveLabel}
      </Button>
    </form>
  );
}

export function AuthSettingsForm({ props }: AuthSettingsFormProps) {
  const { labels } = props;
  useMountAction("loadAuthSettings");

  const loaded = useStateValue(ADMIN_STATE.authSettings.loaded) as
    | AuthSettingsLoaded
    | null
    | undefined;
  const loading = (useStateValue(ADMIN_STATE.authSettings.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.authSettings.error) as string | null | undefined;

  if (loading) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (!loaded) {
    return null;
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        {labels.description && <CardDescription>{labels.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <AuthSettingsFields
          key={loaded.loadedAt}
          loaded={loaded}
          labels={labels}
          loadError={loadError}
        />
      </CardContent>
    </Card>
  );
}
