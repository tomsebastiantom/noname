import { useStateValue } from "@json-render/react";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  retryWebhookOutboundDelivery,
  type WebhookOutboundDeliveryRow,
  type WebhookSubscriptionRow,
} from "../../../auth/webhooks-settings";
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
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

type WebhookSubscriptionsLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  urlLabel: string;
  eventTypesLabel: string;
  eventTypesHelper: string;
  descriptionLabel: string;
  createLabel: string;
  creatingLabel: string;
  deleteLabel: string;
  deletingLabel: string;
  enabledLabel: string;
  disabledLabel: string;
  signingSecretLabel: string;
  deliveriesTitle: string;
  deliveriesEmptyLabel: string;
  retryLabel: string;
  retryingLabel: string;
  columns: {
    url: string;
    events: string;
    status: string;
    failures: string;
    actions: string;
    when: string;
    eventType: string;
    attempts: string;
    httpStatus: string;
  };
};

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function SubscriptionsTable({
  rows,
  labels,
  onDelete,
  deletingId,
}: {
  rows: WebhookSubscriptionRow[];
  labels: WebhookSubscriptionsLabels;
  onDelete: (id: string) => Promise<void>;
  deletingId: string | null;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4">{labels.columns.url}</th>
            <th className="py-2 pr-4">{labels.columns.events}</th>
            <th className="py-2 pr-4">{labels.columns.status}</th>
            <th className="py-2 pr-4">{labels.columns.failures}</th>
            <th className="py-2">{labels.columns.actions}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b align-top">
              <td className="py-2 pr-4 font-mono text-xs break-all">{row.url}</td>
              <td className="py-2 pr-4">{row.eventTypes.join(", ")}</td>
              <td className="py-2 pr-4">
                {row.enabled ? labels.enabledLabel : labels.disabledLabel}
              </td>
              <td className="py-2 pr-4">{row.consecutiveFailures}</td>
              <td className="py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deletingId === row.id}
                  onClick={() => void onDelete(row.id)}
                >
                  {deletingId === row.id ? labels.deletingLabel : labels.deleteLabel}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutboundDeliveriesTable({
  rows,
  labels,
  onRefresh,
  loading,
}: {
  rows: WebhookOutboundDeliveryRow[];
  labels: WebhookSubscriptionsLabels;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry(id: string) {
    setError(null);
    setRetryingId(id);
    try {
      await retryWebhookOutboundDelivery(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.deliveriesEmptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">{labels.columns.when}</th>
              <th className="py-2 pr-4">{labels.columns.eventType}</th>
              <th className="py-2 pr-4">{labels.columns.status}</th>
              <th className="py-2 pr-4">{labels.columns.attempts}</th>
              <th className="py-2 pr-4">{labels.columns.httpStatus}</th>
              <th className="py-2">{labels.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2 pr-4">{formatWhen(row.createdAt)}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.eventType}</td>
                <td className="py-2 pr-4">{row.status}</td>
                <td className="py-2 pr-4">{row.attemptCount}</td>
                <td className="py-2 pr-4">{row.lastStatusCode ?? "—"}</td>
                <td className="py-2">
                  {row.status === "failed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loading || retryingId === row.id}
                      onClick={() => void handleRetry(row.id)}
                    >
                      {retryingId === row.id ? labels.retryingLabel : labels.retryLabel}
                    </Button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WebhookSubscriptionsAdmin({
  props: { labels },
}: ComponentCtx<CatalogProps<Record<string, never>, WebhookSubscriptionsLabels>>) {
  const canAccess = useAdminRouteAccess("integrations");
  const { executeAction } = useCatalogSubmit();
  useMountAction("loadWebhookSubscriptions", {});
  useMountAction("loadWebhookOutboundDeliveries", {});

  const loading =
    (useStateValue(ADMIN_STATE.integrations.webhooks.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.integrations.webhooks.error) as
    | string
    | null
    | undefined;
  const subscriptions =
    (useStateValue(ADMIN_STATE.integrations.webhooks.loaded) as
      | WebhookSubscriptionRow[]
      | null
      | undefined) ?? [];
  const deliveriesLoading =
    (useStateValue(ADMIN_STATE.integrations.webhookDeliveries.loading) as boolean | undefined) ??
    true;
  const deliveriesError = useStateValue(ADMIN_STATE.integrations.webhookDeliveries.error) as
    | string
    | null
    | undefined;
  const deliveries =
    (useStateValue(ADMIN_STATE.integrations.webhookDeliveries.loaded) as
      | WebhookOutboundDeliveryRow[]
      | null
      | undefined) ?? [];

  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState("order.paid, *");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (canAccess === false) {
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

  if (canAccess === null) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  async function refreshAll() {
    await Promise.all([
      executeAction("loadWebhookSubscriptions"),
      executeAction("loadWebhookOutboundDeliveries"),
    ]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createWebhookSubscription({
        url: url.trim(),
        eventTypes: eventTypes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        description: description.trim() || undefined,
      });
      setUrl("");
      setDescription("");
      await refreshAll();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteWebhookSubscription(id);
      await refreshAll();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-8">
        {mergeCatalogError(createError, loadError) ? (
          <Alert variant="destructive">
            <AlertDescription>{mergeCatalogError(createError, loadError)}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{labels.urlLabel}</Label>
            <Input
              id="webhook-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://merchant.example/hooks/noname"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-events">{labels.eventTypesLabel}</Label>
            <Input
              id="webhook-events"
              value={eventTypes}
              onChange={(e) => setEventTypes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{labels.eventTypesHelper}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-description">{labels.descriptionLabel}</Label>
            <Input
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{labels.signingSecretLabel}</p>
          <Button type="submit" disabled={creating || loading}>
            {creating ? labels.creatingLabel : labels.createLabel}
          </Button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-medium">{labels.title}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshAll()}>
              {labels.refreshLabel}
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
          ) : (
            <SubscriptionsTable
              rows={subscriptions}
              labels={labels}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">{labels.deliveriesTitle}</h3>
          {mergeCatalogError(null, deliveriesError) ? (
            <Alert variant="destructive">
              <AlertDescription>{mergeCatalogError(null, deliveriesError)}</AlertDescription>
            </Alert>
          ) : null}
          {deliveriesLoading ? (
            <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
          ) : (
            <OutboundDeliveriesTable
              rows={deliveries}
              labels={labels}
              loading={deliveriesLoading}
              onRefresh={() => void executeAction("loadWebhookOutboundDeliveries")}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
