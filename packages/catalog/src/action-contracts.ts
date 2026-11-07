/**
 * Action → capability contracts.
 *
 * An action name is a client-side handler; a capability is the server-side command/query with a permission.
 * This table is the only place that links them, so M2 can ask “is the action wired to a capability that
 * exists, belongs to an installed extension, and declares the permission we expect?”.
 *
 * Only actions that actually cross into a capability are listed. Cart actions and `loadPublishedContent`
 * call public storefront routes, not capabilities, so they have no contract.
 */

export type ActionContract = {
  capability: string;
  extension: string;
  /** Permission the capability is expected to declare (drift between this and the registry is a failure). */
  permission: string;
};

export const actionContracts: Record<string, ActionContract> = {
  checkout: {
    capability: "commerce.checkout",
    extension: "commerce",
    permission: "storefront:view",
  },
  loadOrdersAdmin: {
    capability: "commerce.orders.search",
    extension: "commerce",
    permission: "commerce:orders_view",
  },
  loadOrderDetail: {
    capability: "commerce.orders.get",
    extension: "commerce",
    permission: "commerce:orders_view",
  },
  cancelOrder: {
    capability: "commerce.orders.cancel",
    extension: "commerce",
    permission: "commerce:orders_manage",
  },
  fulfillOrder: {
    capability: "commerce.orders.fulfill",
    extension: "commerce",
    permission: "commerce:orders_manage",
  },
  refundOrder: {
    capability: "commerce.orders.refund",
    extension: "commerce",
    permission: "commerce:orders_manage",
  },
};

export function actionContract(name: string): ActionContract | null {
  return actionContracts[name] ?? null;
}
