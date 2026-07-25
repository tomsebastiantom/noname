export const commerceActions = {
  addToCart: async (params: unknown) => {
    const { productId, quantity } = params as { productId: string; quantity: number };
    await fetch("/api/machines/cart/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity }),
    });
  },
  checkout: async () => {
    window.location.href = "/checkout";
  },
};
