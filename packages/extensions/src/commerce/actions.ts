import { addProductToCart, checkout, mergeGuestCartOnLogin } from "./cart";
import { fetchCommerceEvidenceLinks, fetchCommerceOrders } from "./orders-admin-api";

export const commerceActions = {
  addToCart: async (params: unknown) => {
    const { productId, quantity = 1 } = params as { productId: string; quantity?: number };
    await addProductToCart(productId, quantity);
  },
  /** Also wired as the platform `onLogin` lifecycle — invocable by name too. */
  mergeGuestCart: async () => {
    await mergeGuestCartOnLogin();
  },
  checkout: async () => {
    await checkout();
  },
  loadOrdersAdmin: async () => fetchCommerceOrders(),
  loadOrderEvidenceLinks: async (recordId: string) => fetchCommerceEvidenceLinks(recordId),
};
