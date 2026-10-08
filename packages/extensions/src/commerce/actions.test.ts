import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commerceActions } from "./actions";
import {
  CommerceOrdersHttpError,
  CommerceOrdersPermissionError,
  cancelCommerceOrder,
  fetchCommerceOrder,
  fetchCommerceOrders,
  fulfillCommerceOrder,
  isCommerceOrdersConflictError,
} from "./orders-admin-api";
import { getCachedProduct } from "./product-catalog";
import { fetchPublishedContent } from "./product-content-api";

vi.mock("./product-content-api", () => ({ fetchPublishedContent: vi.fn() }));

const params = {
  listingKey: "listing-test",
  contentType: "product",
  collectionSlug: null,
  query: null,
  locale: null,
  limit: 12,
  offset: 0,
  productIdField: "productId",
  titleField: "title",
  priceField: "price",
  imageField: "image",
  descriptionField: "description",
  currency: "CAD",
};

describe("loadPublishedContent commerce action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores published records in renderer listing state and caches product display data", async () => {
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      items: [
        {
          id: "entry-1",
          data: {
            productId: "sku-1",
            title: "Blue Sneakers",
            price: 99.99,
            image: "https://assets.example/shoes.png",
            description: null,
          },
        },
      ],
      limit: 12,
      offset: 0,
      locale: "en-CA",
      nextOffset: null,
    });

    let state: Record<string, unknown> = {};
    const setState = (updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
      state = updater(state);
    };
    await commerceActions.loadPublishedContent(params, setState);

    const listings = state.commerceListings as Record<string, Record<string, unknown>>;
    const listing = listings[params.listingKey];
    if (!listing) throw new Error("published content action did not create listing state");
    expect(listing.items).toMatchObject([
      { id: "entry-1", productId: "sku-1", title: "Blue Sneakers", price: 99.99 },
    ]);
    expect(listing).toMatchObject({ loading: false, error: null, offset: 0, limit: 12 });
    expect(getCachedProduct("sku-1")).toMatchObject({
      title: "Blue Sneakers",
      price: 99.99,
      currency: "CAD",
      image: "https://assets.example/shoes.png",
    });
  });

  it("keeps an omitted non-public price unavailable instead of presenting zero", async () => {
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      items: [{ id: "entry-private-price", data: { productId: "sku-private" } }],
      limit: 12,
      offset: 0,
      locale: "en-CA",
      nextOffset: null,
    });

    let state: Record<string, unknown> = {};
    const setState = (updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
      state = updater(state);
    };
    await commerceActions.loadPublishedContent(
      { ...params, listingKey: "private-price" },
      setState,
    );

    const listings = state.commerceListings as Record<string, Record<string, unknown>>;
    const listing = listings["private-price"];
    if (!listing) throw new Error("published content action did not create listing state");
    expect(listing.items).toMatchObject([{ price: null }]);
    expect(getCachedProduct("sku-private")).toBeUndefined();
  });
});

describe("Commerce Orders capability API", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", { getItem: () => "orders-token" });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("fresh-command-key") });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("searches through the existing capability route with a bearer token and no command key", async () => {
    const responseBody = { data: { items: [], nextCursor: null } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(responseBody),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCommerceOrders({ search: "order-1", status: "paid", limit: 25 }),
    ).resolves.toEqual(responseBody.data);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capabilities/commerce.orders.search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer orders-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ input: { search: "order-1", status: "paid", limit: 25 } }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("loads detail and sends fresh idempotency keys only with commands", async () => {
    const order = {
      id: "order-1",
      orderRef: "ORD-1",
      status: "paid",
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      paymentRef: "pay-1",
      amountMinor: 1234,
      currency: "USD",
      minorUnitExponent: 2,
      lineItems: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      revision: 3,
      evidenceRecords: [],
      evidenceLinks: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: order }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("cancel-key").mockReturnValueOnce("fulfill-key"),
    });

    await expect(fetchCommerceOrder("order-1")).resolves.toEqual(order);
    await cancelCommerceOrder({
      orderId: "order-1",
      expectedRevision: 3,
      reason: "Customer request",
    });
    await fulfillCommerceOrder({
      orderId: "order-1",
      expectedRevision: 3,
      trackingNumber: "TRACK-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/capabilities/commerce.orders.get",
      expect.objectContaining({ body: JSON.stringify({ input: { orderId: "order-1" } }) }),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "cancel-key",
    });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "fulfill-key",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        input: { orderId: "order-1", expectedRevision: 3, reason: "Customer request" },
      }),
    );
  });

  it("normalizes legacy partial details with missing totals, lines, and evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: {
            id: "legacy-order",
            orderRef: "LEGACY-1",
            status: "paid",
            paymentStatus: "paid",
            fulfillmentStatus: "unfulfilled",
            paymentRef: null,
            amountMinor: null,
            currency: "CAD",
            minorUnitExponent: 2,
            lineItems: null,
            detailCompleteness: "partial",
            createdAt: null,
            updatedAt: null,
            revision: 1,
          },
        }),
      }),
    );

    await expect(fetchCommerceOrder("legacy-order")).resolves.toMatchObject({
      amountMinor: null,
      lineItems: [],
      evidenceRecords: [],
      evidenceLinks: [],
      detailCompleteness: "partial",
    });
  });

  it("exposes a conflict status so stale order revisions can be refreshed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ message: "revision conflict" }),
      }),
    );

    const cause = await cancelCommerceOrder({
      orderId: "order-1",
      expectedRevision: 3,
      reason: "Customer request",
    }).catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(CommerceOrdersHttpError);
    expect(cause).toMatchObject({ status: 409, message: "revision conflict" });
    expect(isCommerceOrdersConflictError(cause)).toBe(true);
  });

  it.each([401, 403])("maps %s responses to a permission-oriented error", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json: vi.fn() }));
    await expect(fetchCommerceOrders()).rejects.toBeInstanceOf(CommerceOrdersPermissionError);
  });
});
