import { useCallback, useEffect, useState } from "react";
import type { ComponentCtx } from "../types";
import { commerceActions } from "./actions";
import type { EvidenceOrderRecord } from "./orders-admin-api";

type OrdersAdminProps = {
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

export function OrdersAdmin({ props }: ComponentCtx<OrdersAdminProps>) {
  const [rows, setRows] = useState<EvidenceOrderRecord[]>([]);
  const [selected, setSelected] = useState<EvidenceOrderRecord | null>(null);
  const [links, setLinks] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [linksLoading, setLinksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await commerceActions.loadOrdersAdmin();
      setRows(orders);
      setSelected(null);
      setLinks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function selectOrder(row: EvidenceOrderRecord) {
    setSelected(row);
    setLinksLoading(true);
    setDetailError(null);
    try {
      const evidenceLinks = await commerceActions.loadOrderEvidenceLinks(row.id);
      setLinks(evidenceLinks);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load order detail");
      setLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md border border-destructive p-3 text-sm">{error}</p> : null}
      {detailError ? (
        <p className="rounded-md border border-destructive p-3 text-sm">{detailError}</p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          disabled={loading}
          onClick={() => void loadOrders()}
        >
          {loading ? props.refreshingLabel : props.refreshLabel}
        </button>
      </div>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
        ) : null}
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{props.loadingLabel}</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{props.emptyLabel}</p>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2">{props.orderColumnHeader}</th>
                  <th className="p-2">{props.amountColumnHeader}</th>
                  <th className="p-2">{props.currencyColumnHeader}</th>
                  <th className="p-2">{props.paymentColumnHeader}</th>
                  <th className="p-2">{props.dateColumnHeader}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b hover:bg-muted/50"
                    onClick={() => void selectOrder(row)}
                  >
                    <td className="p-2 font-mono text-xs">{row.subjectId}</td>
                    <td className="p-2">{formatAmount(row.data.amount, row.data.currency)}</td>
                    <td className="p-2">{String(row.data.currency ?? "—").toUpperCase()}</td>
                    <td className="p-2 font-mono text-xs">{String(row.data.paymentRef ?? "—")}</td>
                    <td className="p-2">{new Date(row.occurredAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected ? (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">{props.detailsTitle}</h2>
          {props.detailsDescription ? (
            <p className="mt-1 text-sm text-muted-foreground">{props.detailsDescription}</p>
          ) : null}
          <pre className="mt-4 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(selected.data, null, 2)}
          </pre>
          <h3 className="mt-4 text-sm font-medium">{props.linksTitle}</h3>
          {linksLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">{props.linksLoadingLabel}</p>
          ) : links.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{props.noLinksLabel}</p>
          ) : (
            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(links, null, 2)}
            </pre>
          )}
        </section>
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
