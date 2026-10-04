import { addProductToCart, checkout, mergeGuestCartOnLogin, setCartItemQuantity } from "./cart";
import { fetchCommerceEvidenceLinks, fetchCommerceOrders } from "./orders-admin-api";
import { cacheProduct } from "./product-catalog";
import { fetchPublishedContent } from "./product-content-api";

type ListingRequest = {
  listingKey: string;
  contentType: string;
  collectionSlug: string | null;
  query: string | null;
  locale: string | null;
  limit: number;
  offset: number;
  productIdField: string;
  titleField: string;
  priceField: string;
  imageField: string;
  descriptionField: string;
  currency: string;
};

type ListingPatch = Record<string, unknown>;
type ListingSetState = (
  updater: (previous: Record<string, unknown>) => Record<string, unknown>,
) => void;

function withListingState(
  previous: Record<string, unknown>,
  listingKey: string,
  patch: ListingPatch,
): Record<string, unknown> {
  const current = previous.commerceListings;
  const listings =
    current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  const entry = listings[listingKey];
  const priorEntry = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  return {
    ...previous,
    commerceListings: { ...listings, [listingKey]: { ...priorEntry, ...patch } },
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function priceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export const commerceActions = {
  addToCart: async (params: unknown) => {
    const { productId, quantity = 1 } = params as { productId: string; quantity?: number };
    await addProductToCart(productId, quantity);
  },
  updateCartItem: async (params: unknown) => {
    const { productId, quantity } = params as { productId: string; quantity: number };
    await setCartItemQuantity(productId, quantity);
  },
  /** Also wired as the platform `onLogin` lifecycle — invocable by name too. */
  mergeGuestCart: async () => {
    await mergeGuestCartOnLogin();
  },
  checkout: async () => {
    await checkout();
  },
  loadPublishedContent: async (params: unknown, setState: ListingSetState) => {
    const request = params as ListingRequest;
    setState((previous) =>
      withListingState(previous, request.listingKey, {
        request,
        loading: true,
        error: null,
        offset: request.offset,
        limit: request.limit,
      }),
    );
    try {
      const page = await fetchPublishedContent({
        type: request.contentType,
        locale: request.locale ?? undefined,
        collectionSlug: request.collectionSlug,
        query: request.query ?? undefined,
        limit: request.limit,
        offset: request.offset,
      });
      const items = page.items.map((item) => {
        const productId = stringValue(item.data[request.productIdField], item.id);
        const title = stringValue(item.data[request.titleField], productId);
        const price = priceValue(item.data[request.priceField]);
        const imageValue = item.data[request.imageField];
        const image = typeof imageValue === "string" ? imageValue : null;
        if (price !== null)
          cacheProduct({ productId, title, price, currency: request.currency, image });
        return {
          id: item.id,
          data: item.data,
          productId,
          title,
          price,
          currency: request.currency,
          image,
          description: item.data[request.descriptionField] ?? null,
        };
      });
      setState((previous) =>
        withListingState(previous, request.listingKey, {
          request: { ...request, locale: page.locale },
          items,
          loading: false,
          error: null,
          offset: page.offset,
          limit: page.limit,
          nextOffset: page.nextOffset,
        }),
      );
    } catch (err) {
      setState((previous) =>
        withListingState(previous, request.listingKey, {
          request,
          items: [],
          loading: false,
          error: err instanceof Error ? err.message : "Could not load content",
          offset: request.offset,
          limit: request.limit,
          nextOffset: null,
        }),
      );
    }
  },
  loadOrdersAdmin: async () => fetchCommerceOrders(),
  loadOrderEvidenceLinks: async (recordId: string) => fetchCommerceEvidenceLinks(recordId),
};

export type StorefrontListingState = {
  request: ListingRequest;
  items: Array<{
    id: string;
    data: Record<string, unknown>;
    productId: string;
    title: string;
    price: number | null;
    currency: string;
    image: string | null;
    description: unknown;
  }>;
  loading: boolean;
  error: string | null;
  offset: number;
  limit: number;
  nextOffset: number | null;
};
