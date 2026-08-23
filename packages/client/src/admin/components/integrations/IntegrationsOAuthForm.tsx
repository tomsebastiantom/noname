import { useStateValue } from "@json-render/react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import type { OAuthConnectionState } from "../../../auth/integrations-settings";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { IntegrationsOAuthLoaded } from "../../../core/actions/integrations";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

type IntegrationsOAuthLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  connectLabel: string;
  connectingLabel: string;
  connectedLabel: string;
  notConfiguredLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  connectionIdLabel: string;
  providerLabel: string;
};

function integrationTitle(row: OAuthConnectionState): string {
  return row.displayName?.trim() || row.integrationId;
}

function integrationSubtitle(row: OAuthConnectionState, providerLabel: string): string | null {
  if (row.provider && row.provider !== row.integrationId) {
    return `${providerLabel}: ${row.provider}`;
  }
  return null;
}

function OAuthProviderRow({
  row,
  labels,
  oauthConfigured,
}: {
  row: OAuthConnectionState;
  labels: IntegrationsOAuthLabels;
  oauthConfigured: boolean;
}) {
  const catalog = useCatalogSubmit();
  const { submit, pending } = catalog;
  const subtitle = integrationSubtitle(row, labels.providerLabel);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start gap-3">
        {row.logo ? (
          <img
            src={row.logo}
            alt=""
            className="h-8 w-8 rounded object-contain shrink-0"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="font-medium">{integrationTitle(row)}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          <p className="text-xs text-muted-foreground font-mono break-all">{row.integrationId}</p>
        </div>
      </div>
      {row.connected ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            {labels.connectedLabel}
          </p>
          {row.connectionId ? (
            <p className="text-xs text-muted-foreground font-mono break-all">
              {labels.connectionIdLabel}: {row.connectionId}
            </p>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          disabled={pending || !oauthConfigured}
          onClick={() =>
            void submit({
              action: "startIntegrationsOAuthConnect",
              params: { integrationId: row.integrationId },
            })
          }
        >
          {pending ? labels.connectingLabel : labels.connectLabel}
        </Button>
      )}
    </div>
  );
}

function IntegrationsOAuthFields({
  loaded,
  labels,
  loadError,
}: {
  loaded: IntegrationsOAuthLoaded;
  labels: IntegrationsOAuthLabels;
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const { submit, error } = catalog;

  return (
    <div className="space-y-6">
      {mergeCatalogError(error, loadError) ? (
        <Alert variant="destructive">
          <AlertDescription>{mergeCatalogError(error, loadError)}</AlertDescription>
        </Alert>
      ) : null}

      {!loaded.oauthConfigured ? (
        <Alert>
          <AlertDescription>{labels.notConfiguredLabel}</AlertDescription>
        </Alert>
      ) : null}

      {loaded.connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.emptyLabel}</p>
      ) : (
        loaded.connections.map((row) => (
          <OAuthProviderRow
            key={row.integrationId}
            row={row}
            labels={labels}
            oauthConfigured={loaded.oauthConfigured}
          />
        ))
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => void submit({ action: "loadIntegrationsOAuth" })}
      >
        {labels.refreshLabel}
      </Button>
    </div>
  );
}

export function IntegrationsOAuthForm({ props }: ComponentCtx<IntegrationsOAuthLabels>) {
  const labels = props;
  const canAccess = useAdminRouteAccess("integrations");

  useMountAction("loadIntegrationsOAuth");

  const loaded = useStateValue(ADMIN_STATE.integrations.oauth.loaded) as
    | IntegrationsOAuthLoaded
    | null
    | undefined;
  const loading =
    (useStateValue(ADMIN_STATE.integrations.oauth.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.integrations.oauth.error) as
    | string
    | null
    | undefined;

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
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
          <IntegrationsOAuthFields loaded={loaded} labels={labels} loadError={loadError} />
        )}
      </CardContent>
    </Card>
  );
}
