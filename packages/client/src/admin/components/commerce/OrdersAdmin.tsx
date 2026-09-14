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
import type { EvidenceOrderRecord } from "../../orders";
import { DataTable, type DataTableColumn } from "../shared/DataTable";

type OrdersAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  refreshingLabel: string;
  forbiddenLabel: string;
  orderColumnHeader: string;
  amountColumnHeader: string;
  currencyColumnHeader: string;
  paymentColumnHeader: string;
  dateColumnHeader: string;
  detailsTitle: string;
  detailsDescription: string | null;
  linksTitle: string;
  linksLoadingLabel: string;
  noLinksLabel: string;
};

export function OrdersAdmin({ props }: Readonly<ComponentCtx<OrdersAdminLabels>>) {
  const canViewOrders = useAdminRouteAccess("orders");
  const { execute } = useActions();
  const rows = (useStateValue(ADMIN_STATE.orders.rows) as EvidenceOrderRecord[] | undefined) ?? [];
  const selected = useStateValue(ADMIN_STATE.orders.selected) as
    | EvidenceOrderRecord
    | null
    | undefined;
  const links =
    (useStateValue(ADMIN_STATE.orders.links) as Array<Record<string, unknown>> | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.orders.loading) as boolean | undefined) ?? true;
  const linksLoading =
    (useStateValue(ADMIN_STATE.orders.linksLoading) as boolean | undefined) ?? false;
  const loadError = useStateValue(ADMIN_STATE.orders.error) as string | null | undefined;

  const columns: DataTableColumn<EvidenceOrderRecord>[] = [
    {
      key: "order",
      header: props.orderColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.subjectId}</span>,
    },
    {
      key: "amount",
      header: props.amountColumnHeader,
      cell: (row) => formatAmount(row.data.amount, row.data.currency),
    },
    {
      key: "currency",
      header: props.currencyColumnHeader,
      cell: (row) => String(row.data.currency ?? "—").toUpperCase(),
    },
    {
      key: "payment",
      header: props.paymentColumnHeader,
      cell: (row) => (
        <span className="font-mono text-xs">{String(row.data.paymentRef ?? "—")}</span>
      ),
    },
    {
      key: "date",
      header: props.dateColumnHeader,
      cell: (row) => new Date(row.occurredAt).toLocaleString(),
    },
  ];

  async function selectOrder(row: EvidenceOrderRecord) {
    await execute({ action: "selectOrderAdmin", params: { row } });
  }

  if (canViewOrders === null) {
    return <p className="text-sm text-muted-foreground">{props.loadingLabel}</p>;
  }
  if (canViewOrders === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{props.forbiddenLabel}</AlertDescription>
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
          onClick={() => void execute({ action: "loadOrdersAdmin" })}
        >
          {loading ? props.refreshingLabel : props.refreshLabel}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description ? <CardDescription>{props.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{props.loadingLabel}</p>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => void selectOrder(row)}
              emptyMessage={props.emptyLabel}
            />
          )}
        </CardContent>
      </Card>
      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>{props.detailsTitle}</CardTitle>
            {props.detailsDescription ? (
              <CardDescription>{props.detailsDescription}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(selected.data, null, 2)}
            </pre>
            <div>
              <h3 className="mb-2 text-sm font-medium">{props.linksTitle}</h3>
              {linksLoading ? (
                <p className="text-sm text-muted-foreground">{props.linksLoadingLabel}</p>
              ) : links.length === 0 ? (
                <p className="text-sm text-muted-foreground">{props.noLinksLabel}</p>
              ) : (
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(links, null, 2)}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function formatAmount(amount: unknown, currency: unknown) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: String(currency ?? "CAD").toUpperCase(),
  }).format(value / 100);
}
