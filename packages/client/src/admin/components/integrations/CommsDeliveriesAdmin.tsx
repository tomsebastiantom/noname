import { useStateValue } from "@json-render/react";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import {
  loadCommsDeliveries,
  retryCommsDelivery,
  type CommsDeliveryRow,
} from "../../../auth/notifications-settings";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

type CommsDeliveriesLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  forbiddenLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  retryLabel: string;
  retryingLabel: string;
  statusFilterLabel: string;
  allStatusesLabel: string;
  columns: {
    when: string;
    status: string;
    to: string;
    subject: string;
    trigger: string;
    attempts: string;
    actions: string;
  };
};

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function DeliveriesTable({
  labels,
  rows,
  onRefresh,
  loading,
}: {
  labels: CommsDeliveriesLabels;
  rows: CommsDeliveryRow[];
  onRefresh: () => void;
  loading: boolean;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry(id: string) {
    setError(null);
    setRetryingId(id);
    try {
      await retryCommsDelivery(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{labels.columns.when}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.status}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.to}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.subject}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.trigger}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.attempts}</th>
              <th className="px-3 py-2 font-medium">{labels.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.toAddress}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{row.subject ?? "—"}</td>
                <td className="px-3 py-2">{row.trigger ?? row.templateId ?? "—"}</td>
                <td className="px-3 py-2">{row.attemptCount}</td>
                <td className="px-3 py-2">
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

export function CommsDeliveriesAdmin({
  props,
}: ComponentCtx<CatalogProps<Record<string, never>, CommsDeliveriesLabels>>) {
  const { labels } = props;
  const canAccess = useAdminRouteAccess("integrations");
  const { submit } = useCatalogSubmit();

  useMountAction("loadCommsDeliveries");

  const rows = useStateValue(ADMIN_STATE.integrations.commsDeliveries.loaded) as
    | CommsDeliveryRow[]
    | null
    | undefined;
  const loading =
    (useStateValue(ADMIN_STATE.integrations.commsDeliveries.loading) as boolean | undefined) ??
    true;
  const loadError = useStateValue(ADMIN_STATE.integrations.commsDeliveries.error) as
    | string
    | null
    | undefined;
  const [statusFilter, setStatusFilter] = useState<string>("");

  function reload() {
    void submit("loadCommsDeliveries", { status: statusFilter || undefined });
  }

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
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={reload}>
          {labels.refreshLabel}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center gap-2">
          <label htmlFor="delivery-status-filter" className="text-sm font-medium">
            {labels.statusFilterLabel}
          </label>
          <select
            id="delivery-status-filter"
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              void submit("loadCommsDeliveries", {
                status: e.target.value || undefined,
              });
            }}
          >
            <option value="">{labels.allStatusesLabel}</option>
            <option value="queued">queued</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
        ) : (
          <DeliveriesTable
            labels={labels}
            rows={rows ?? []}
            loading={loading}
            onRefresh={reload}
          />
        )}
      </CardContent>
    </Card>
  );
}
