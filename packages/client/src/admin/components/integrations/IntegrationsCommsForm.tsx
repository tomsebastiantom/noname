import { useStateValue } from "@json-render/react";
import type { CommsProviderName } from "@noname/shared";
import { COMMS_EMAIL_PROVIDERS, COMMS_SMS_PROVIDERS } from "@noname/shared";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { IntegrationsCommsLoaded } from "../../../core/actions/integrations";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

type IntegrationsCommsLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  providerLabel: string;
  apiKeyLabel: string;
  apiKeyPlaceholderNew: string;
  apiKeyPlaceholderExisting: string;
  configuredBadgeLabel: string;
  fromEmailLabel: string;
  fromNameLabel: string;
  mailgunDomainLabel: string;
  mailgunDomainPlaceholder: string;
  saveLabel: string;
  savingLabel: string;
  successMessage: string;
};

function IntegrationsCommsFields({
  loaded,
  labels,
  loadError,
}: {
  loaded: IntegrationsCommsLoaded;
  labels: IntegrationsCommsLabels;
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, clearSuccess } = catalog;

  const [emailProvider, setEmailProvider] = useState<CommsProviderName>(loaded.emailProvider);
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState(loaded.fromEmail ?? "");
  const [fromName, setFromName] = useState(loaded.fromName ?? "");
  const [mailgunDomain, setMailgunDomain] = useState(loaded.mailgunDomain ?? "");

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        clearSuccess();
        void submit({
          action: "saveIntegrationsComms",
          params: {
            emailProvider,
            apiKey: apiKey.trim() || undefined,
            fromEmail: fromEmail.trim() || undefined,
            fromName: fromName.trim() || undefined,
            mailgunDomain: mailgunDomain.trim() || undefined,
          },
        });
      }}
    >
      {mergeCatalogError(error, loadError) ? (
        <Alert variant="destructive">
          <AlertDescription>{mergeCatalogError(error, loadError)}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{labels.successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="comms-provider">{labels.providerLabel}</Label>
        <select
          id="comms-provider"
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={emailProvider}
          onChange={(e) => setEmailProvider(e.target.value as CommsProviderName)}
        >
          {COMMS_EMAIL_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {provider === "ses"
                ? "Amazon SES"
                : provider.charAt(0).toUpperCase() + provider.slice(1)}
            </option>
          ))}
          {COMMS_SMS_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              Twilio (SMS)
            </option>
          ))}
        </select>
        {loaded.hasOrgKey ? (
          <p className="text-xs text-muted-foreground">{labels.configuredBadgeLabel}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="comms-api-key">{labels.apiKeyLabel}</Label>
        <Input
          id="comms-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            loaded.hasOrgKey ? labels.apiKeyPlaceholderExisting : labels.apiKeyPlaceholderNew
          }
        />
      </div>

      {emailProvider === "mailgun" ? (
        <div className="space-y-2">
          <Label htmlFor="comms-mailgun-domain">{labels.mailgunDomainLabel}</Label>
          <Input
            id="comms-mailgun-domain"
            value={mailgunDomain}
            onChange={(e) => setMailgunDomain(e.target.value)}
            placeholder={labels.mailgunDomainPlaceholder}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="comms-from-email">{labels.fromEmailLabel}</Label>
        <Input
          id="comms-from-email"
          type="email"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="comms-from-name">{labels.fromNameLabel}</Label>
        <Input
          id="comms-from-name"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? labels.savingLabel : labels.saveLabel}
      </Button>
    </form>
  );
}

export function IntegrationsCommsForm({ props }: ComponentCtx<IntegrationsCommsLabels>) {
  const labels = props;
  const canAccess = useAdminRouteAccess("integrations");

  useMountAction("loadIntegrationsComms");

  const loaded = useStateValue(ADMIN_STATE.integrations.comms.loaded) as
    | IntegrationsCommsLoaded
    | null
    | undefined;
  const loading =
    (useStateValue(ADMIN_STATE.integrations.comms.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.integrations.comms.error) as
    | string
    | null
    | undefined;

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{labels.forbiddenLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {loading || !loaded ? (
          <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
        ) : (
          <IntegrationsCommsFields loaded={loaded} labels={labels} loadError={loadError} />
        )}
      </CardContent>
    </Card>
  );
}
