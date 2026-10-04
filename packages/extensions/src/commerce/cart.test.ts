import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProductToCart, setCartItemQuantity } from "./cart";

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createSessionStorage() {
  const values = new Map<string, string>([
    ["noname:cart_instance_id", "cart-1"],
    ["noname:publishable_key", "store-key"],
  ]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const activeCart = (items: Array<{ productId: string; quantity: number }>) => ({
  id: "cart-1",
  currentState: "active",
  context: { items, total: 0, currency: "cad" },
});

describe("storefront cart item actions", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorage());
  });

  it("removes an item by setting its quantity to zero", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(activeCart([{ productId: "sku-1", quantity: 2 }])));
    fetchMock.mockResolvedValueOnce(response(activeCart([])));
    vi.stubGlobal("fetch", fetchMock);

    await setCartItemQuantity("sku-1", 0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ items: [] });
  });

  it("merges repeated add-to-cart clicks into one line item", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response(
        activeCart([
          { productId: "sku-1", quantity: 1 },
          { productId: "sku-1", quantity: 2 },
        ]),
      ),
    );
    fetchMock.mockResolvedValueOnce(response(activeCart([{ productId: "sku-1", quantity: 5 }])));
    vi.stubGlobal("fetch", fetchMock);

    await addProductToCart("sku-1", 2);

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      items: [{ productId: "sku-1", quantity: 5 }],
    });
  });
});
