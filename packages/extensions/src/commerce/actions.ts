import { addProductToCart, checkout, mergeGuestCartOnLogin } from "./cart";

export const commerceActions = {
  addToCart: async (params: unknown) => {
    const { productId, quantity = 1, price } = params as { productId: string; quantity?: number; price?: number };
    await addProductToCart(productId, quantity, price);
  },
  /** Also wired as the platform `onLogin` lifecycle — invocable by name too. */
  mergeGuestCart: async () => {
    await mergeGuestCartOnLogin();
  },
  checkout: async () => {
    await checkout();
  },
};
