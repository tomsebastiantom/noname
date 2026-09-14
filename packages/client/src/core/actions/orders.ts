import { fetchCommerceOrders, fetchEvidenceLinks } from "../../admin/orders";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export const ordersActions = {
  loadOrdersAdmin: (async (_params, setState) => {
    setState(ADMIN_STATE.orders.loading, true);
    setState(ADMIN_STATE.orders.error, null);
    try {
      const rows = await fetchCommerceOrders();
      setState(ADMIN_STATE.orders.rows, rows);
      setState(ADMIN_STATE.orders.selected, null);
      setState(ADMIN_STATE.orders.links, []);
    } catch (err) {
      setState(
        ADMIN_STATE.orders.error,
        err instanceof Error ? err.message : "Failed to load orders",
      );
      setState(ADMIN_STATE.orders.rows, []);
    } finally {
      setState(ADMIN_STATE.orders.loading, false);
    }
  }) satisfies CatalogActionHandler,

  selectOrderAdmin: (async (params, setState) => {
    const input = params as { row?: Record<string, unknown> };
    const row = input.row;
    if (!row || typeof row.id !== "string") return;
    setState(ADMIN_STATE.orders.selected, row);
    await ordersActions.loadOrderLinks({ recordId: row.id }, setState);
  }) satisfies CatalogActionHandler,

  loadOrderLinks: (async (params, setState) => {
    const input = params as { recordId?: unknown };
    const recordId = typeof input.recordId === "string" ? input.recordId : "";
    if (!recordId) return;
    setState(ADMIN_STATE.orders.linksLoading, true);
    try {
      const links = await fetchEvidenceLinks(recordId);
      setState(ADMIN_STATE.orders.links, links);
    } catch {
      setState(ADMIN_STATE.orders.links, []);
    } finally {
      setState(ADMIN_STATE.orders.linksLoading, false);
    }
  }) satisfies CatalogActionHandler,
};
