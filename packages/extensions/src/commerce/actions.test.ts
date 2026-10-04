import { beforeEach, describe, expect, it, vi } from "vitest";
import { commerceActions } from "./actions";
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
