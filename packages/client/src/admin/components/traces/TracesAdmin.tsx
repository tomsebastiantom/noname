import { useActions, useStateValue } from "@json-render/react";
import { useEffect, useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
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
import type { TraceSpanRow, TraceSummaryRow } from "../../traces";
import { DataTable, type DataTableColumn } from "../shared/DataTable";

type TracesAdminConfig = Record<string, never>;

type TracesAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  empty: string;
  refreshLabel: string;
  refreshingLabel: string;
  forbiddenLabel: string;
  operationColumnHeader: string;
  durationColumnHeader: string;
  spansColumnHeader: string;
  statusColumnHeader: string;
  timeColumnHeader: string;
  traceIdColumnHeader: string;
  detailTitle: string;
  detailHint: string;
  detailLoadingLabel: string;
  detailEmptyLabel: string;
  okLabel: string;
  errorLabel: string;
  serviceColumnHeader: string;
  spanTagsLabel: string;
  copyTraceIdLabel: string;
  copiedTraceIdLabel: string;
  openJaegerLabel: string;
};

const JAEGER_TRACE_URL = "http://localhost:16686/trace";

function shortTraceId(traceId: string): string {
  if (traceId.length <= 16) return traceId;
  return `${traceId.slice(0, 8)}…${traceId.slice(-4)}`;
}

function SpanWaterfall({
  spans,
  tagsLabel,
}: Readonly<{ spans: TraceSpanRow[]; tagsLabel: string }>) {
  return (
    <ul className="space-y-1">
      {spans.map((span) => {
        const tagEntries = Object.entries(span.tags);
        return (
          <li key={span.spanId} className="rounded-md border bg-muted/20 px-3 py-2">
            <div
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
              style={{ paddingLeft: `${span.depth * 12}px` }}
            >
              <span className="font-mono text-xs font-medium">{span.operationName}</span>
              <span className="text-xs text-muted-foreground">{span.serviceName}</span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {span.durationMs} ms
              </span>
            </div>
            {tagEntries.length > 0 ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {tagsLabel} ({tagEntries.length})
                </summary>
                <dl className="mt-2 grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                  {tagEntries.map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="font-mono text-muted-foreground">{key}</dt>
                      <dd className="break-all font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TracesAdmin({
  props,
}: Readonly<ComponentCtx<CatalogProps<TracesAdminConfig, TracesAdminLabels>>>) {
  const { labels } = props;
  const canViewTraces = useAdminRouteAccess("traces");
  const { execute } = useActions();
  const [copied, setCopied] = useState(false);

  const traces = (useStateValue(ADMIN_STATE.traces.traces) as TraceSummaryRow[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.traces.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.traces.error) as string | null | undefined;
  const selectedTraceId = useStateValue(ADMIN_STATE.traces.selectedTraceId) as
    | string
    | null
    | undefined;
  const detailSpans =
    (useStateValue(ADMIN_STATE.traces.detailSpans) as TraceSpanRow[] | undefined) ?? [];
  const detailLoading =
    (useStateValue(ADMIN_STATE.traces.detailLoading) as boolean | undefined) ?? false;
  const detailError = useStateValue(ADMIN_STATE.traces.detailError) as string | null | undefined;

  useEffect(() => {
    if (canViewTraces !== true) return;
    const params = new URLSearchParams(window.location.search);
    const traceId = params.get("traceId")?.trim().toLowerCase() ?? "";
    if (!/^[0-9a-f]{32}$/.test(traceId)) return;
    if (selectedTraceId === traceId) return;
    void execute({ action: "loadTraceDetail", params: { traceId } });
  }, [canViewTraces, execute, selectedTraceId]);

  const traceColumns: DataTableColumn<TraceSummaryRow>[] = [
    {
      key: "startTime",
      header: labels.timeColumnHeader,
      cell: (row) => new Date(row.startTime).toLocaleString(),
    },
    {
      key: "traceId",
      header: labels.traceIdColumnHeader,
      cell: (row) => (
        <span className="font-mono text-xs" title={row.traceId}>
          {shortTraceId(row.traceId)}
        </span>
      ),
    },
    {
      key: "rootOperation",
      header: labels.operationColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.rootOperation}</span>,
    },
    {
      key: "durationMs",
      header: labels.durationColumnHeader,
      cell: (row) => `${row.durationMs.toLocaleString()} ms`,
    },
    {
      key: "spanCount",
      header: labels.spansColumnHeader,
      cell: (row) => row.spanCount,
    },
    {
      key: "status",
      header: labels.statusColumnHeader,
      cell: (row) => (
        <Badge variant={row.hasError ? "outline" : "secondary"}>
          {row.hasError ? labels.errorLabel : labels.okLabel}
        </Badge>
      ),
    },
  ];

  async function handleRefresh() {
    await execute({ action: "loadTracesAdmin" });
  }

  async function handleSelectTrace(row: TraceSummaryRow) {
    setCopied(false);
    await execute({ action: "loadTraceDetail", params: { traceId: row.traceId } });
  }

  async function handleCopyTraceId() {
    if (!selectedTraceId) return;
    try {
      await navigator.clipboard.writeText(selectedTraceId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (canViewTraces === null) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (canViewTraces === false) {
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
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <div className="max-h-[28rem] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
            ) : traces.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
              <DataTable
                columns={traceColumns}
                rows={traces}
                rowKey={(row) => row.traceId}
                onRowClick={(row) => void handleSelectTrace(row)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {selectedTraceId ? (
        <Card>
          <CardHeader>
            <CardTitle>{labels.detailTitle}</CardTitle>
            <CardDescription>{labels.detailHint}</CardDescription>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {selectedTraceId}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopyTraceId()}
              >
                {copied ? labels.copiedTraceIdLabel : labels.copyTraceIdLabel}
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={`${JAEGER_TRACE_URL}/${selectedTraceId}`} target="_blank" rel="noreferrer">
                  {labels.openJaegerLabel}
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {detailError ? (
              <Alert variant="destructive">
                <AlertDescription>{detailError}</AlertDescription>
              </Alert>
            ) : null}
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">{labels.detailLoadingLabel}</p>
            ) : detailSpans.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.detailEmptyLabel}</p>
            ) : (
              <div className="max-h-[24rem] overflow-y-auto">
                <SpanWaterfall spans={detailSpans} tagsLabel={labels.spanTagsLabel} />
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
