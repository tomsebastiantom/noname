import { useActions, useStateValue } from "@json-render/react";
import { isRichTextDocument } from "@noname/documents";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { RichTextRenderer } from "../shared/RichTextRenderer";
import type { ComponentCtx } from "../types";
import type { StorefrontListingState } from "./actions";
import { CART_UPDATED_EVENT, getCart } from "./cart";
import { formatProductPrice, getCachedProduct } from "./product-catalog";

const LISTING_STATE = "/commerceListings";

type CartItem = { productId: string; quantity: number };
type CartSnapshot = {
  id: string;
  currentState: string;
  context: { items?: CartItem[]; total?: number; currency?: string };
};

type CartDrawerProps = {
  title: string;
  openLabel: string;
  closeLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  subtotalLabel: string;
  removeItemLabel: string;
  decreaseQuantityLabel: string;
  increaseQuantityLabel: string;
  checkoutLabel: string;
  priceUnavailableLabel: string;
  currency: string;
};

export function CartDrawer({ props }: ComponentCtx<CartDrawerProps>) {
  const { execute } = useActions();
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingProduct, setUpdatingProduct] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const executeRef = useRef(execute);
  executeRef.current = execute;

  async function refreshCart() {
    try {
      setCart((await getCart()) as CartSnapshot);
      setError(null);
    } catch {
      setError(props.errorLabel);
    } finally {
      setLoading(false);
    }
  }

  const refreshRef = useRef(refreshCart);
  refreshRef.current = refreshCart;
  useEffect(() => {
    const onCartUpdated = () => void refreshRef.current();
    window.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
    void refreshRef.current();
    return () => window.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
  }, []);

  const items = cart?.context.items ?? [];
  const pricedItems = items.map((item) => ({ item, product: getCachedProduct(item.productId) }));
  const total = pricedItems.reduce(
    (sum, row) => sum + (row.product?.price ?? 0) * row.item.quantity,
    0,
  );
  const currency = cart?.context.currency?.toUpperCase() ?? props.currency;

  async function updateItem(productId: string, quantity: number) {
    setUpdatingProduct(productId);
    try {
      await execute({ action: "updateCartItem", params: { productId, quantity } });
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
    } catch {
      setError(props.errorLabel);
    } finally {
      setUpdatingProduct(null);
    }
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      await execute({ action: "checkout" });
    } catch {
      setError(props.errorLabel);
      setCheckoutLoading(false);
    }
  }

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-30 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg"
        aria-expanded={open}
        aria-controls="commerce-cart-drawer"
        onClick={() => setOpen(true)}
      >
        {props.openLabel} <span className="ml-1 tabular-nums">{count}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label={props.closeLabel}
            onClick={() => setOpen(false)}
          />
          <aside
            id="commerce-cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commerce-cart-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background p-6 shadow-xl"
          >
            <header className="flex items-center justify-between gap-4 border-b pb-4">
              <h2 id="commerce-cart-title" className="text-xl font-semibold">
                {props.title} <span className="text-sm text-muted-foreground">({count})</span>
              </h2>
              <button
                type="button"
                className="rounded-md border px-3 py-2"
                onClick={() => setOpen(false)}
              >
                {props.closeLabel}
              </button>
            </header>
            {loading ? (
              <p className="py-8 text-sm text-muted-foreground" role="status">
                {props.loadingLabel}
              </p>
            ) : items.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">{props.emptyLabel}</p>
            ) : (
              <ul className="my-5 flex-1 space-y-4 overflow-y-auto">
                {pricedItems.map(({ item, product }) => (
                  <li key={item.productId} className="flex gap-3 border-b pb-4">
                    {product?.image && (
                      <img
                        src={product.image}
                        alt=""
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{product?.title ?? item.productId}</p>
                      <p className="text-sm text-muted-foreground">
                        {product
                          ? formatProductPrice(product.price * item.quantity, currency)
                          : props.priceUnavailableLabel}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 disabled:opacity-50"
                          aria-label={`${props.decreaseQuantityLabel}: ${product?.title ?? item.productId}`}
                          disabled={updatingProduct === item.productId || item.quantity <= 1}
                          onClick={() => void updateItem(item.productId, item.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 disabled:opacity-50"
                          aria-label={`${props.increaseQuantityLabel}: ${product?.title ?? item.productId}`}
                          disabled={updatingProduct === item.productId || item.quantity >= 999}
                          onClick={() => void updateItem(item.productId, item.quantity + 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ml-auto text-sm underline"
                          disabled={updatingProduct === item.productId}
                          onClick={() => void updateItem(item.productId, 0)}
                        >
                          {props.removeItemLabel}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <footer className="mt-auto border-t pt-4">
              <div className="mb-4 flex justify-between font-semibold">
                <span>{props.subtotalLabel}</span>
                <span>{formatProductPrice(total, currency)}</span>
              </div>
              <button
                type="button"
                className="w-full rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
                disabled={
                  loading ||
                  items.length === 0 ||
                  pricedItems.some((row) => !row.product) ||
                  checkoutLoading
                }
                onClick={() => void startCheckout()}
              >
                {checkoutLoading ? props.loadingLabel : props.checkoutLabel}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

type CheckoutButtonProps = {
  checkoutLabel: string;
  loadingLabel: string;
  errorLabel: string;
  variant: "primary" | "outline" | "link";
};

const checkoutClasses: Record<CheckoutButtonProps["variant"], string> = {
  primary: "rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground",
  outline: "rounded-md border px-5 py-3 font-medium",
  link: "font-medium underline underline-offset-4",
};

export function CheckoutButton({ props }: ComponentCtx<CheckoutButtonProps>) {
  const { execute } = useActions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function onCheckout() {
    setLoading(true);
    setError(false);
    try {
      await execute({ action: "checkout" });
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`${checkoutClasses[props.variant]} disabled:opacity-50`}
        disabled={loading}
        aria-busy={loading}
        onClick={() => void onCheckout()}
      >
        {loading ? props.loadingLabel : props.checkoutLabel}
      </button>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {props.errorLabel}
        </p>
      )}
    </div>
  );
}

type ListingBaseProps = {
  listingKey: string;
  contentType: string;
  collectionSlug: string | null;
  pageSize: number;
  currency: string;
  productIdField: string;
  titleField: string;
  priceField: string;
  imageField: string;
  descriptionField: string;
  title: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  priceUnavailableLabel: string;
  addToCartLabel: string;
  addingLabel: string;
  addedToCartMessage: string;
  addFailedMessage: string;
};

type ListingCardItem = StorefrontListingState["items"][number];

function createListingRequest(props: ListingBaseProps, query: string | null = null) {
  return {
    listingKey: props.listingKey,
    contentType: props.contentType,
    collectionSlug: props.collectionSlug,
    query,
    locale: null,
    limit: props.pageSize,
    offset: 0,
    productIdField: props.productIdField,
    titleField: props.titleField,
    priceField: props.priceField,
    imageField: props.imageField,
    descriptionField: props.descriptionField,
    currency: props.currency,
  };
}

function useLoadListingOnMount(request: ReturnType<typeof createListingRequest>) {
  const { execute } = useActions();
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const requestRef = useRef(request);
  requestRef.current = request;
  const requestKey = JSON.stringify(request);

  // biome-ignore lint/correctness/useExhaustiveDependencies: requestKey serializes the stable request payload.
  useEffect(() => {
    void executeRef.current({ action: "loadPublishedContent", params: requestRef.current });
  }, [requestKey]);
}

function ListingCards({
  props,
  state,
}: {
  props: ListingBaseProps;
  state: StorefrontListingState | undefined;
}) {
  if (state?.loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" role="status">
        {props.loadingLabel}
      </p>
    );
  }
  if (state?.error) {
    return (
      <p className="py-8 text-center text-sm text-destructive" role="alert">
        {props.errorLabel}
      </p>
    );
  }
  if (!state?.items.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{props.emptyLabel}</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-5">
      {state.items.map((item) => (
        <ListingProductCard
          key={item.id}
          item={item}
          currency={props.currency}
          addToCartLabel={props.addToCartLabel}
          addingLabel={props.addingLabel}
          addedToCartMessage={props.addedToCartMessage}
          addFailedMessage={props.addFailedMessage}
          priceUnavailableLabel={props.priceUnavailableLabel}
        />
      ))}
    </div>
  );
}

function ListingProductCard({
  item,
  currency,
  addToCartLabel,
  addingLabel,
  addedToCartMessage,
  addFailedMessage,
  priceUnavailableLabel,
}: {
  item: ListingCardItem;
  currency: string;
  addToCartLabel: string;
  addingLabel: string;
  addedToCartMessage: string;
  addFailedMessage: string;
  priceUnavailableLabel: string;
}) {
  const { execute } = useActions();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function addToCart() {
    setLoading(true);
    setStatus(null);
    try {
      await execute({ action: "addToCart", params: { productId: item.productId, quantity: 1 } });
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
      setStatus(addedToCartMessage);
    } catch {
      setStatus(addFailedMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {item.image && <img src={item.image} alt={item.title} className="h-48 w-full object-cover" />}
      <div className="p-4">
        <h3 className="text-lg font-semibold">{item.title}</h3>
        {isRichTextDocument(item.description) && (
          <RichTextRenderer
            document={item.description}
            className="mt-1 text-sm text-muted-foreground"
          />
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-semibold">
            {item.price === null ? priceUnavailableLabel : formatProductPrice(item.price, currency)}
          </span>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={loading || item.price === null}
            onClick={() => void addToCart()}
          >
            {loading ? addingLabel : addToCartLabel}
          </button>
        </div>
        {status && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {status}
          </p>
        )}
      </div>
    </article>
  );
}

export type CollectionPageProps = ListingBaseProps;

export function CollectionPage({ props }: ComponentCtx<CollectionPageProps>) {
  const request = createListingRequest(props);
  useLoadListingOnMount(request);
  const state = useStateValue<StorefrontListingState>(`${LISTING_STATE}/${props.listingKey}`);
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{props.title}</h1>
      <ListingCards props={props} state={state} />
    </section>
  );
}

export type SearchResultsProps = ListingBaseProps & {
  searchPlaceholder: string;
  searchButtonLabel: string;
};

export function SearchResults({ props }: ComponentCtx<SearchResultsProps>) {
  const request = createListingRequest(props);
  useLoadListingOnMount(request);
  const { execute } = useActions();
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const state = useStateValue<StorefrontListingState>(`${LISTING_STATE}/${props.listingKey}`);
  const [query, setQuery] = useState("");

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await executeRef.current({
      action: "loadPublishedContent",
      params: { ...request, query: query.trim() || null, offset: 0 },
    });
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{props.title}</h1>
      <form className="mb-6 flex gap-2" onSubmit={(event) => void onSearch(event)}>
        <input
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
          type="search"
          value={query}
          placeholder={props.searchPlaceholder}
          aria-label={props.searchPlaceholder}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <button
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          type="submit"
        >
          {props.searchButtonLabel}
        </button>
      </form>
      <ListingCards props={props} state={state} />
    </section>
  );
}

export function Pagination({
  props,
}: ComponentCtx<{
  listingKey: string;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
}>) {
  const { execute } = useActions();
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const state = useStateValue<StorefrontListingState>(`${LISTING_STATE}/${props.listingKey}`);
  if (!state) return null;
  const request = state.request;
  const pageNumber = Math.floor(state.offset / state.limit) + 1;

  function navigate(offset: number) {
    void executeRef.current({
      action: "loadPublishedContent",
      params: { ...request, offset },
    });
  }

  return (
    <nav
      className="mx-auto flex max-w-7xl items-center justify-center gap-4 px-6 py-6"
      aria-label={props.pageLabel}
    >
      <button
        type="button"
        className="rounded-md border px-4 py-2 disabled:opacity-50"
        disabled={state.loading || state.offset <= 0}
        onClick={() => navigate(Math.max(0, state.offset - state.limit))}
      >
        {props.previousLabel}
      </button>
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {props.pageLabel} {pageNumber}
      </span>
      <button
        type="button"
        className="rounded-md border px-4 py-2 disabled:opacity-50"
        disabled={state.loading || state.nextOffset === null}
        onClick={() => navigate(state.nextOffset ?? state.offset)}
      >
        {props.nextLabel}
      </button>
    </nav>
  );
}
