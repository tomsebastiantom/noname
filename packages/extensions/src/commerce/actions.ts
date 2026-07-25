import { addProductToCart } from "./cart";

export const commerceActions = {
  addToCart: async (params: unknown) => {
    const { productId, quantity = 1 } = params as { productId: string; quantity?: number };
    await addProductToCart(productId, quantity);
  },
  checkout: async () => {
    window.location.href = "/checkout";
  },
};
