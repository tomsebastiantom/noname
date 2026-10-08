import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { ComponentCtx } from "../types";
import { commerceActions } from "./actions";
import { commerceComponentSchemas } from "./catalog-schemas";
import type {
  CommerceOrder,
  CommerceOrderPage,
  CommerceOrderSearchInput,
  CommerceOrderStatus,
  CommerceOrderSummary,
} from "./orders-admin-api";
import { isCommerceOrdersConflictError, isCommerceOrdersPermissionError } from "./orders-admin-api";
import { formatMinorAmount } from "./product-catalog";

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
  searchLabel: string;
  searchPlaceholder: string;
  statusFilterLabel: string;
  allStatusLabel: string;
  paidStatusLabel: string;
  cancelledStatusLabel: string;
  fulfilledStatusLabel: string;
  unfulfilledStatusLabel: string;
  currencyFilterLabel: string;
  createdAfterLabel: string;
  createdBeforeLabel: string;
  applyFiltersLabel: string;
  clearFiltersLabel: string;
  cancelFormCloseLabel: string;
  nextPageLabel: string;
  previousPageLabel: string;
  orderRefLabel: string;
  statusLabel: string;
  paymentStatusLabel: string;
  fulfillmentStatusLabel: string;
  lineItemsTitle: string;
  itemLabel: string;
  quantityLabel: string;
  unitPriceLabel: string;
  lineTotalLabel: string;
  noLineItemsLabel: string;
  cancelButtonLabel: string;
  cancelReasonLabel: string;
  cancelConfirmLabel: string;
  cancellingLabel: string;
  fulfillButtonLabel: string;
  fulfillmentReferenceLabel: string;
  carrierLabel: string;
  trackingNumberLabel: string;
  fulfillConfirmLabel: string;
  fulfillingLabel: string;
  refundButtonLabel?: string;
  refundConfirmLabel?: string;
  refundReasonLabel?: string;
  refundAmountLabel?: string;
  refundingLabel?: string;
  refundFormCloseLabel?: string;
  actionSuccessLabel: string;
  reasonRequiredLabel: string;
  evidenceRecordsLabel: string;
  partialDetailsLabel: string;
  staleRevisionLabel: string;
};

type SearchDraft = {
  search: string;
  status: "" | CommerceOrderStatus;
  currency: string;
  createdAfter: string;
  createdBefore: string;
};

const emptySearch: SearchDraft = {
  search: "",
  status: "",
  currency: "",
  createdAfter: "",
  createdBefore: "",
};

const PAGE_SIZE = 25;

export function OrdersAdmin({ props: rawProps }: ComponentCtx<OrdersAdminProps>) {
  // Persisted layout blocks may predate newer labels; apply catalog defaults at render time.
  const props = commerceComponentSchemas.OrdersAdmin.props.parse(rawProps);
  const [rows, setRows] = useState<CommerceOrderSummary[]>([]);
  const [selected, setSelected] = useState<CommerceOrder | null>(null);
  const [draft, setDraft] = useState<SearchDraft>(emptySearch);
  const [filters, setFilters] = useState<SearchDraft>(emptySearch);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [cancelFormOpen, setCancelFormOpen] = useState(false);
  const [fulfillFormOpen, setFulfillFormOpen] = useState(false);
  const [refundFormOpen, setRefundFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [fulfillmentReference, setFulfillmentReference] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundAmountMinor, setRefundAmountMinor] = useState<number | undefined>(undefined);

  const activeCursor = cursorStack[pageIndex];

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const input: CommerceOrderSearchInput = {
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        currency: filters.currency.trim().toUpperCase() || undefined,
        createdAfter: toDateBoundary(filters.createdAfter, false),
        createdBefore: toDateBoundary(filters.createdBefore, true),
        cursor: activeCursor,
        limit: PAGE_SIZE,
      };
      const page: CommerceOrderPage = await commerceActions.loadOrdersAdmin(input);
      setRows(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setRows([]);
      setNextCursor(null);
      setError(errorMessage(cause, props.forbiddenLabel));
    } finally {
      setLoading(false);
    }
  }, [activeCursor, filters, props.forbiddenLabel]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleActionError(cause: unknown, orderId: string) {
    const message = errorMessage(cause, props.forbiddenLabel);
    if (!isCommerceOrdersConflictError(cause)) {
      setDetailError(message);
      return;
    }

    setDetailLoading(true);
    try {
      setSelected(await commerceActions.loadOrderDetail(orderId));
    } catch {
      // Keep the last authorized detail snapshot if a refresh is unavailable.
    } finally {
      setDetailLoading(false);
    }
    await loadOrders();
    setDetailError(`${props.staleRevisionLabel} ${message}`);
  }

  async function selectOrder(row: CommerceOrderSummary) {
    setSelected(null);
    setDetailLoading(true);
    setDetailError(null);
    setActionSuccess(null);
    closeActionForms();
    try {
      const order = await commerceActions.loadOrderDetail(row.id);
      setSelected(order);
    } catch (cause) {
      setDetailError(errorMessage(cause, props.forbiddenLabel));
    } finally {
      setDetailLoading(false);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageIndex(0);
    setCursorStack([undefined]);
    setFilters({ ...draft });
  }

  function clearFilters() {
    setDraft(emptySearch);
    setPageIndex(0);
    setCursorStack([undefined]);
    setFilters(emptySearch);
  }

  function goToNextPage() {
    if (!nextCursor) return;
    setCursorStack((previous) => [...previous.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((previous) => previous + 1);
  }

  function goToPreviousPage() {
    setPageIndex((previous) => Math.max(0, previous - 1));
  }

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || actionLoading) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setDetailError(props.reasonRequiredLabel);
      return;
    }
    if (!window.confirm(props.cancelConfirmLabel)) return;

    setActionLoading(true);
    setDetailError(null);
    setActionSuccess(null);
    try {
      const updated = await commerceActions.cancelOrder({
        orderId: selected.id,
        expectedRevision: selected.revision,
        reason,
      });
      setSelected({ ...selected, ...updated });
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setCancelReason("");
      setCancelFormOpen(false);
      try {
        setSelected(await commerceActions.loadOrderDetail(updated.id));
      } catch (detailCause) {
        setDetailError(errorMessage(detailCause, props.forbiddenLabel));
      }
      await loadOrders();
      setActionSuccess(props.actionSuccessLabel);
    } catch (cause) {
      await handleActionError(cause, selected.id);
    } finally {
      setActionLoading(false);
    }
  }

  async function submitFulfillment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || actionLoading) return;
    if (!window.confirm(props.fulfillConfirmLabel)) return;

    setActionLoading(true);
    setDetailError(null);
    setActionSuccess(null);
    try {
      const updated = await commerceActions.fulfillOrder({
        orderId: selected.id,
        expectedRevision: selected.revision,
        fulfillmentReference: fulfillmentReference.trim() || undefined,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
      });
      setSelected({ ...selected, ...updated });
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setFulfillmentReference("");
      setCarrier("");
      setTrackingNumber("");
      setFulfillFormOpen(false);
      try {
        setSelected(await commerceActions.loadOrderDetail(updated.id));
      } catch (detailCause) {
        setDetailError(errorMessage(detailCause, props.forbiddenLabel));
      }
      await loadOrders();
      setActionSuccess(props.actionSuccessLabel);
    } catch (cause) {
      await handleActionError(cause, selected.id);
    } finally {
      setActionLoading(false);
    }
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || actionLoading) return;
    if (!window.confirm(props.refundConfirmLabel ?? "Refund this order?")) return;

    setActionLoading(true);
    setDetailError(null);
    setActionSuccess(null);
    try {
      const updated = await commerceActions.refundOrder({
        orderId: selected.id,
        expectedRevision: selected.revision,
        amountMinor: refundAmountMinor,
        reason: refundReason.trim() || undefined,
      });
      setSelected({ ...selected, ...updated });
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setRefundReason("");
      setRefundAmountMinor(undefined);
      setRefundFormOpen(false);
      try {
        setSelected(await commerceActions.loadOrderDetail(updated.id));
      } catch (detailCause) {
        setDetailError(errorMessage(detailCause, props.forbiddenLabel));
      }
      await loadOrders();
      setActionSuccess(props.actionSuccessLabel);
    } catch (cause) {
      await handleActionError(cause, selected.id);
    } finally {
      setActionLoading(false);
    }
  }

  function closeActionForms() {
    setCancelFormOpen(false);
    setFulfillFormOpen(false);
    setRefundFormOpen(false);
    setDetailError(null);
  }

  const canCancel =
    selected?.status === "paid" && selected.fulfillmentStatus.toLowerCase() !== "fulfilled";
  const canFulfill =
    selected?.status === "paid" && selected.fulfillmentStatus.toLowerCase() !== "fulfilled";
  const canRefund = selected?.status === "paid" && selected.fulfillmentStatus.toLowerCase() === "fulfilled";

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md border border-destructive p-3 text-sm">{error}</p> : null}
      {detailError ? (
        <p className="rounded-md border border-destructive p-3 text-sm">{detailError}</p>
      ) : null}
      {actionSuccess ? (
        <p className="rounded-md border border-emerald-600 p-3 text-sm">{actionSuccess}</p>
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
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={applyFilters}>
          <label className="grid gap-1 text-sm">
            <span>{props.searchLabel}</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              placeholder={props.searchPlaceholder}
              value={draft.search}
              onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{props.statusFilterLabel}</span>
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={draft.status}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  status: event.target.value as SearchDraft["status"],
                }))
              }
            >
              <option value="">{props.allStatusLabel}</option>
              <option value="paid">{props.paidStatusLabel}</option>
              <option value="cancelled">{props.cancelledStatusLabel}</option>
              <option value="fulfilled">{props.fulfilledStatusLabel}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{props.currencyFilterLabel}</span>
            <input
              className="rounded-md border bg-background px-3 py-2 uppercase"
              maxLength={3}
              placeholder="CAD"
              value={draft.currency}
              onChange={(event) =>
                setDraft((value) => ({ ...value, currency: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{props.createdAfterLabel}</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              type="date"
              value={draft.createdAfter}
              onChange={(event) =>
                setDraft((value) => ({ ...value, createdAfter: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{props.createdBeforeLabel}</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              type="date"
              value={draft.createdBefore}
              onChange={(event) =>
                setDraft((value) => ({ ...value, createdBefore: event.target.value }))
              }
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              type="submit"
            >
              {props.applyFiltersLabel}
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="button"
              onClick={clearFilters}
            >
              {props.clearFiltersLabel}
            </button>
          </div>
        </form>
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
                  <th className="p-2">{props.statusLabel}</th>
                  <th className="p-2">{props.paymentColumnHeader}</th>
                  <th className="p-2">{props.dateColumnHeader}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/50">
                    <td className="p-2">
                      <button
                        type="button"
                        className="font-mono text-xs underline-offset-4 hover:underline"
                        onClick={() => void selectOrder(row)}
                      >
                        {row.orderRef || row.id}
                      </button>
                    </td>
                    <td className="p-2">{formatOrderAmount(row)}</td>
                    <td className="p-2">{row.currency.toUpperCase()}</td>
                    <td className="p-2">{displayStatus(row.status, props)}</td>
                    <td className="p-2">{displayStatus(row.paymentStatus, props)}</td>
                    <td className="p-2">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="mt-4 flex justify-between" aria-label={props.title}>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            disabled={loading || pageIndex === 0}
            onClick={goToPreviousPage}
          >
            {props.previousPageLabel}
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            disabled={loading || !nextCursor}
            onClick={goToNextPage}
          >
            {props.nextPageLabel}
          </button>
        </nav>
      </section>
      {detailLoading ? (
        <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
          {props.linksLoadingLabel}
        </p>
      ) : null}
      {selected ? (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">{props.detailsTitle}</h2>
          {props.detailsDescription ? (
            <p className="mt-1 text-sm text-muted-foreground">{props.detailsDescription}</p>
          ) : null}
          {selected.detailCompleteness === "partial" ? (
            <p className="mt-2 rounded-md bg-muted p-3 text-sm">{props.partialDetailsLabel}</p>
          ) : null}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label={props.orderRefLabel} value={selected.orderRef || selected.id} />
            <Detail label={props.statusLabel} value={displayStatus(selected.status, props)} />
            <Detail
              label={props.paymentStatusLabel}
              value={displayStatus(selected.paymentStatus, props)}
            />
            <Detail
              label={props.fulfillmentStatusLabel}
              value={displayStatus(selected.fulfillmentStatus, props)}
            />
            <Detail label={props.paymentColumnHeader} value={selected.paymentRef || "—"} />
            <Detail label={props.amountColumnHeader} value={formatOrderAmount(selected)} />
            <Detail label={props.dateColumnHeader} value={formatDate(selected.createdAt)} />
          </dl>
          <h3 className="mt-6 text-sm font-semibold">{props.lineItemsTitle}</h3>
          {selected.lineItems.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{props.noLineItemsLabel}</p>
          ) : (
            <div className="mt-2 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2">{props.itemLabel}</th>
                    <th className="p-2">{props.quantityLabel}</th>
                    <th className="p-2">{props.unitPriceLabel}</th>
                    <th className="p-2">{props.lineTotalLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lineItems.map((item) => (
                    <tr className="border-b" key={`${selected.id}-line-${lineItemKey(item)}`}>
                      <td className="p-2">
                        {lineItemValue(item, ["title", "name", "productName", "productId"]) ||
                          props.itemLabel}
                      </td>
                      <td className="p-2">{lineItemValue(item, ["quantity"]) || "—"}</td>
                      <td className="p-2">
                        {formatLineAmount(
                          item,
                          ["unitAmountMinor", "unitPriceMinor", "priceMinor"],
                          selected,
                        )}
                      </td>
                      <td className="p-2">
                        {formatLineAmount(
                          item,
                          ["lineAmountMinor", "lineTotalMinor", "totalMinor", "amountMinor"],
                          selected,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {canCancel && !cancelFormOpen && !fulfillFormOpen ? (
              <button
                type="button"
                className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50"
                disabled={actionLoading}
                onClick={() => {
                  setDetailError(null);
                  setCancelFormOpen(true);
                }}
              >
                {props.cancelButtonLabel}
              </button>
            ) : null}
            {canFulfill && !cancelFormOpen && !fulfillFormOpen ? (
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                disabled={actionLoading}
                onClick={() => {
                  setDetailError(null);
                  setFulfillFormOpen(true);
                }}
              >
                {props.fulfillButtonLabel}
              </button>
            ) : null}
            {canRefund && !cancelFormOpen && !fulfillFormOpen && !refundFormOpen ? (
              <button
                type="button"
                className="rounded-md border border-emerald-600 px-3 py-2 text-sm text-emerald-600 disabled:opacity-50"
                disabled={actionLoading}
                onClick={() => {
                  setDetailError(null);
                  setRefundFormOpen(true);
                }}
              >
                {props.refundButtonLabel ?? "Refund"}
              </button>
            ) : null}
          </div>
          {cancelFormOpen ? (
            <form className="mt-4 grid max-w-xl gap-3" onSubmit={submitCancellation}>
              <label className="grid gap-1 text-sm">
                <span>{props.cancelReasonLabel}</span>
                <textarea
                  className="min-h-24 rounded-md border bg-background px-3 py-2"
                  maxLength={500}
                  minLength={3}
                  required
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50"
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? props.cancellingLabel : props.cancelButtonLabel}
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  type="button"
                  disabled={actionLoading}
                  onClick={closeActionForms}
                >
                  {props.cancelFormCloseLabel}
                </button>
              </div>
            </form>
          ) : null}
          {fulfillFormOpen ? (
            <form className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2" onSubmit={submitFulfillment}>
              <TextField
                label={props.fulfillmentReferenceLabel}
                value={fulfillmentReference}
                onChange={setFulfillmentReference}
              />
              <TextField label={props.carrierLabel} value={carrier} onChange={setCarrier} />
              <TextField
                label={props.trackingNumberLabel}
                value={trackingNumber}
                onChange={setTrackingNumber}
              />
              <div className="flex items-end gap-2">
                <button
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? props.fulfillingLabel : props.fulfillButtonLabel}
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  type="button"
                  disabled={actionLoading}
                  onClick={closeActionForms}
                >
                  {props.cancelFormCloseLabel}
                </button>
              </div>
            </form>
          ) : null}
          {refundFormOpen ? (
            <form className="mt-4 grid max-w-xl gap-3" onSubmit={submitRefund}>
              <label className="grid gap-1 text-sm">
                <span>{props.refundReasonLabel}</span>
                <textarea
                  className="min-h-16 rounded-md border bg-background px-3 py-2"
                  maxLength={500}
                  required
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{props.refundAmountLabel}</span>
                <input
                  className="rounded-md border bg-background px-3 py-2"
                  type="number"
                  min={0}
                  step={1}
                  value={refundAmountMinor || ""}
                  onChange={(event) => setRefundAmountMinor(Number(event.target.value) || undefined)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? props.refundingLabel : props.refundButtonLabel}
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  type="button"
                  disabled={actionLoading}
                  onClick={closeActionForms}
                >
                  {props.cancelFormCloseLabel}
                </button>
              </div>
            </form>
          ) : null}
          <h3 className="mt-6 text-sm font-medium">{props.evidenceRecordsLabel}</h3>
          <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(
              Array.isArray(selected.evidenceRecords) ? selected.evidenceRecords : [],
              null,
              2,
            )}
          </pre>
          <h3 className="mt-4 text-sm font-medium">{props.linksTitle}</h3>
          {!Array.isArray(selected.evidenceLinks) || selected.evidenceLinks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{props.noLinksLabel}</p>
          ) : (
            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(selected.evidenceLinks, null, 2)}
            </pre>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <input
        className="rounded-md border bg-background px-3 py-2"
        value={value}
        maxLength={200}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function displayStatus(value: string | null | undefined, props: OrdersAdminProps): string {
  switch (value?.trim().toLowerCase()) {
    case "paid":
      return props.paidStatusLabel;
    case "cancelled":
    case "canceled":
      return props.cancelledStatusLabel;
    case "fulfilled":
      return props.fulfilledStatusLabel;
    case "unfulfilled":
      return props.unfulfilledStatusLabel;
    default:
      return "—";
  }
}

function formatOrderAmount(order: CommerceOrderSummary): string {
  if (typeof order.amountMinor !== "number") return "—";
  try {
    return formatMinorAmount(order.amountMinor, order.currency, order.minorUnitExponent);
  } catch {
    return "—";
  }
}

function formatLineAmount(
  item: Record<string, unknown>,
  keys: string[],
  order: CommerceOrderSummary,
): string {
  for (const key of keys) {
    const amount = item[key];
    if (typeof amount === "number" && Number.isSafeInteger(amount)) {
      try {
        return formatMinorAmount(amount, order.currency, order.minorUnitExponent);
      } catch {
        return "—";
      }
    }
  }
  return "—";
}

function lineItemValue(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "";
}

function lineItemKey(item: Record<string, unknown>): string {
  return lineItemValue(item, ["id", "lineItemId", "lineId", "sku"]) || JSON.stringify(item);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function toDateBoundary(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${value}T${time}Z`).toISOString();
}

function errorMessage(cause: unknown, forbiddenLabel: string): string {
  if (isCommerceOrdersPermissionError(cause)) return forbiddenLabel;
  return cause instanceof Error ? cause.message : "Orders request failed";
}
