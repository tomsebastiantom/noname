import { useStateValue } from "@json-render/react";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type { LlmProviderName } from "../../../auth/integrations-settings";
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
import type { IntegrationsLlmLoaded } from "../../../core/actions/integrations";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

type IntegrationsLlmLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  providerLabel: string;
  apiKeyLabel: string;
  apiKeyPlaceholderNew: string;
  apiKeyPlaceholderExisting: string;
  configuredBadgeLabel: string;
  allowPlatformFallbackLabel: string;
  allowPlatformFallbackHelper: string;
  saveLabel: string;
  savingLabel: string;
  successMessage: string;
};

function IntegrationsLlmFields({
  loaded,
  labels,
  loadError,
}: {
  loaded: IntegrationsLlmLoaded;
  labels: IntegrationsLlmLabels;
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, clearSuccess } = catalog;

  const [provider, setProvider] = useState<LlmProviderName>(loaded.provider);
  const [apiKey, setApiKey] = useState("");
  const [allowPlatformFallback, setAllowPlatformFallback] = useState(loaded.allowPlatformFallback);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        clearSuccess();
        void submit({
          action: "saveIntegrationsLlm",
          params: {
            provider,
            apiKey: apiKey.trim() || undefined,
            allowPlatformFallback,
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
        <Label htmlFor="llm-provider">{labels.providerLabel}</Label>
        <select
          id="llm-provider"
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value as LlmProviderName)}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        {loaded.hasOrgKey ? (
          <p className="text-xs text-muted-foreground">{labels.configuredBadgeLabel}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="llm-api-key">{labels.apiKeyLabel}</Label>
        <Input
          id="llm-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            loaded.hasOrgKey ? labels.apiKeyPlaceholderExisting : labels.apiKeyPlaceholderNew
          }
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="llm-platform-fallback"
          type="checkbox"
          className="mt-1"
          checked={allowPlatformFallback}
          onChange={(e) => setAllowPlatformFallback(e.target.checked)}
        />
        <div>
          <Label htmlFor="llm-platform-fallback">{labels.allowPlatformFallbackLabel}</Label>
          <p className="text-xs text-muted-foreground">{labels.allowPlatformFallbackHelper}</p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? labels.savingLabel : labels.saveLabel}
      </Button>
    </form>
  );
}

export function IntegrationsLlmForm({ props }: ComponentCtx<IntegrationsLlmLabels>) {
  const labels = props;
  const canAccess = useAdminRouteAccess("integrations");

  useMountAction("loadIntegrationsLlm");

  const loaded = useStateValue(ADMIN_STATE.integrations.llm.loaded) as
    | IntegrationsLlmLoaded
    | null
    | undefined;
  const loading =
    (useStateValue(ADMIN_STATE.integrations.llm.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.integrations.llm.error) as string | null | undefined;

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
          <IntegrationsLlmFields loaded={loaded} labels={labels} loadError={loadError} />
        )}
      </CardContent>
    </Card>
  );
}
