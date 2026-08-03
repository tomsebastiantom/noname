import { useActions, useStateValue } from "@json-render/react";
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
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import type { AnalyticsAggregationRow, AnalyticsEventRow } from "../../analytics";
import { DataTable, type DataTableColumn } from "../shared/DataTable";

function AnalyticsTableBody<T>({
  loading,
  loadingLabel,
  emptyLabel,
  rows,
  columns,
  rowKey,
}: Readonly<{
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
}>) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return <DataTable columns={columns} rows={rows} rowKey={rowKey} />;
}

type AnalyticsEventsConfig = Record<string, never>;

type AnalyticsEventsLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyEvents: string;
  emptyAggregations: string;
  refreshLabel: string;
  refreshingLabel: string;
  forbiddenLabel: string;
  aggregationsTitle: string;
  aggregationsDescription: string | null;
  eventsTitle: string;
  eventsDescription: string | null;
  eventTypeColumnHeader: string;
  countColumnHeader: string;
  timestampColumnHeader: string;
  sourceColumnHeader: string;
  sessionColumnHeader: string;
  schemaColumnHeader: string;
};

export function AnalyticsEventsAdmin({
  props,
}: Readonly<ComponentCtx<CatalogProps<AnalyticsEventsConfig, AnalyticsEventsLabels>>>) {
  const { labels } = props;
  const canViewAnalytics = useAdminRouteAccess("analytics");
  const { execute } = useActions();

  const events =
    (useStateValue(ADMIN_STATE.analytics.events) as AnalyticsEventRow[] | undefined) ?? [];
  const aggregations =
    (useStateValue(ADMIN_STATE.analytics.aggregations) as AnalyticsAggregationRow[] | undefined) ??
    [];
  const loading = (useStateValue(ADMIN_STATE.analytics.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.analytics.error) as string | null | undefined;

  const aggregationColumns: DataTableColumn<AnalyticsAggregationRow>[] = [
    {
      key: "key",
      header: labels.eventTypeColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.key || "—"}</span>,
    },
    {
      key: "count",
      header: labels.countColumnHeader,
      cell: (row) => row.count.toLocaleString(),
    },
  ];

  const eventColumns: DataTableColumn<AnalyticsEventRow>[] = [
    {
      key: "timestamp",
      header: labels.timestampColumnHeader,
      cell: (row) => new Date(row.timestamp).toLocaleString(),
    },
    {
      key: "eventType",
      header: labels.eventTypeColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.eventType}</span>,
    },
    {
      key: "eventSource",
      header: labels.sourceColumnHeader,
      cell: (row) => row.eventSource,
    },
    {
      key: "sessionId",
      header: labels.sessionColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.sessionId.slice(0, 12)}…</span>,
    },
    {
      key: "schemaId",
      header: labels.schemaColumnHeader,
      cell: (row) =>
        row.schemaId ? <span className="font-mono text-xs">{row.schemaId}</span> : "—",
    },
  ];

  async function handleRefresh() {
    await execute({ action: "loadAnalyticsAdmin" });
  }

  if (canViewAnalytics === null) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (canViewAnalytics === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{labels.forbiddenLabel}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void handleRefresh()}
        >
          {loading ? labels.refreshingLabel : labels.refreshLabel}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{labels.aggregationsTitle}</CardTitle>
          {labels.aggregationsDescription ? (
            <CardDescription>{labels.aggregationsDescription}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <AnalyticsTableBody
            loading={loading}
            loadingLabel={labels.loadingLabel}
            emptyLabel={labels.emptyAggregations}
            rows={aggregations}
            columns={aggregationColumns}
            rowKey={(row) => row.key}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.eventsTitle}</CardTitle>
          {labels.eventsDescription ? (
            <CardDescription>{labels.eventsDescription}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <AnalyticsTableBody
            loading={loading}
            loadingLabel={labels.loadingLabel}
            emptyLabel={labels.emptyEvents}
            rows={events}
            columns={eventColumns}
            rowKey={(row) => row.eventId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
