import { useActions } from "@json-render/react";
import { isRichTextDocument } from "@noname/documents";
import { useEffect, useState } from "react";
import { RichTextRenderer } from "../shared/RichTextRenderer";
import type { ComponentCtx } from "../types";
import { CART_UPDATED_EVENT, CartRequestError, getCart } from "./cart";
import { OrdersAdmin } from "./orders-admin";
import { cacheProduct, formatProductPrice, getCachedProduct } from "./product-catalog";
import {
  CartDrawer,
  CheckoutButton,
  CollectionPage,
  Pagination,
  SearchResults,
} from "./storefront-components";

function renderDescription(description: unknown) {
  if (!isRichTextDocument(description)) return null;
  return <RichTextRenderer document={description} className="mt-1 text-sm text-muted-foreground" />;
}

type HeroProps = {
  title: string;
  subtitle: string | null;
  ctaText: string | null;
  imageAlt: string | null;
  image: string | null;
  ctaAction: string | null;
};

export function Hero({ props, emit }: ComponentCtx<HeroProps>) {
  const labels = props;
  return (
    <section className="bg-muted/50 px-6 py-16 text-center">
      {props.image && (
        <img
          src={props.image}
          alt={labels.imageAlt ?? labels.title}
          className="mx-auto max-h-[400px] max-w-full rounded-lg object-cover"
        />
      )}
      <h1 className="mt-6 text-4xl font-bold tracking-tight">{labels.title}</h1>
      {labels.subtitle && (
        <p className="mx-auto mt-2 max-w-2xl text-lg text-muted-foreground">{labels.subtitle}</p>
      )}
      {labels.ctaText && (
        <button
          type="button"
          className="mt-6 inline-flex items-center rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => props.ctaAction && emit?.(props.ctaAction)}
        >
          {labels.ctaText}
        </button>
      )}
    </section>
  );
}

type CartItem = { productId: string; quantity: number; price?: number };

type ProductCardProps = {
  addToCart: string;
  adding: string;
  addedToCart: string;
  addFailed: string;
  productId: string;
  title: string;
  price: number;
  currency?: string;
  image: string | null;
  description: unknown;
};

export function ProductCard({ props }: ComponentCtx<ProductCardProps>) {
  const labels = props;
  const { execute } = useActions();
  cacheProduct({
    productId: props.productId,
    title: props.title,
    price: props.price,
    currency: props.currency ?? "CAD",
    image: props.image,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onAddToCart() {
    setLoading(true);
    setStatus(null);
    try {
      await execute({
        action: "addToCart",
        params: { productId: props.productId, quantity: 1 },
      });
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
      setStatus(labels.addedToCart);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : labels.addFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {props.image && (
        <img src={props.image} alt={props.title} className="h-[200px] w-full object-cover" />
      )}
      <div className="p-4">
        <h3 className="text-lg font-semibold">{props.title}</h3>
        {renderDescription(props.description)}
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xl font-bold">
            {formatProductPrice(props.price, props.currency ?? "CAD")}
          </span>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={loading}
            onClick={() => void onAddToCart()}
          >
            {loading ? labels.adding : labels.addToCart}
          </button>
        </div>
        {status && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

type ProductGridProps = {
  title: string;
  description: string | null;
  minColumnWidthPx: number;
  gap: number;
};

export function ProductGrid({ props, children }: ComponentCtx<ProductGridProps>) {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-10" aria-label={props.title}>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">{props.title}</h2>
        {props.description && <p className="mt-2 text-muted-foreground">{props.description}</p>}
      </header>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${props.minColumnWidthPx}px), 1fr))`,
          gap: props.gap,
        }}
      >
        {children}
      </div>
    </section>
  );
}

type ProductInfoProps = {
  productId: string;
  title: string;
  price: number;
  currency: string;
  image: string | null;
  imageAlt: string | null;
  description: unknown;
  quantityLabel: string;
  decreaseQuantityLabel: string;
  increaseQuantityLabel: string;
  addToCartLabel: string;
  addingLabel: string;
  addedToCartMessage: string;
  addFailedMessage: string;
  maxQuantity: number;
};

export function ProductInfo({ props }: ComponentCtx<ProductInfoProps>) {
  const { execute } = useActions();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  cacheProduct({
    productId: props.productId,
    title: props.title,
    price: props.price,
    currency: props.currency,
    image: props.image,
  });

  async function addToCart() {
    setLoading(true);
    setStatus(null);
    try {
      await execute({
        action: "addToCart",
        params: { productId: props.productId, quantity },
      });
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
      setStatus(props.addedToCartMessage);
    } catch {
      setStatus(props.addFailedMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 md:grid-cols-2 md:gap-12">
      {props.image ? (
        <img
          src={props.image}
          alt={props.imageAlt ?? props.title}
          className="aspect-square w-full rounded-xl object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded-xl bg-muted" aria-hidden="true" />
      )}
      <div className="flex flex-col items-start justify-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{props.title}</h1>
        <p className="mt-4 text-2xl font-semibold">
          {formatProductPrice(props.price, props.currency)}
        </p>
        {renderDescription(props.description)}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{props.quantityLabel}</span>
            <button
              type="button"
              className="rounded-md border px-3 py-2 disabled:opacity-50"
              aria-label={props.decreaseQuantityLabel}
              disabled={quantity <= 1 || loading}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              −
            </button>
            <span aria-live="polite" className="min-w-8 text-center tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              className="rounded-md border px-3 py-2 disabled:opacity-50"
              aria-label={props.increaseQuantityLabel}
              disabled={quantity >= props.maxQuantity || loading}
              onClick={() => setQuantity((value) => Math.min(props.maxQuantity, value + 1))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
            disabled={loading}
            onClick={() => void addToCart()}
          >
            {loading ? props.addingLabel : props.addToCartLabel}
          </button>
        </div>
        {status && (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {status}
          </p>
        )}
      </div>
    </article>
  );
}

type CartSummaryProps = {
  title: string;
  checkoutLabel: string;
  viewCartLabel: string;
  hideCartLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  itemLabel: string;
  itemsLabel: string;
  removeItemLabel: string;
  decreaseQuantityLabel: string;
  increaseQuantityLabel: string;
  priceUnavailableLabel: string;
  signInLabel: string;
  signInRequiredLabel: string;
  paymentPendingLabel: string;
  paymentSuccessLabel: string;
  paymentFailedLabel: string;
};

export function CartSummary({ props }: ComponentCtx<CartSummaryProps>) {
  const { execute } = useActions();
  const [updatingProduct, setUpdatingProduct] = useState<string | null>(null);
  const [cart, setCart] = useState<{
    context: { items?: CartItem[]; total?: number; currency?: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "success" | "failed" | null>(null);

  useEffect(() => {
    setRequiresSignIn(false);
    const load = async () => {
      try {
        const nextCart = await getCart();
        setCart(nextCart);
        setError(null);
        setPaymentStatus(
          nextCart.currentState === "paid"
            ? "success"
            : nextCart.currentState === "payment_failed"
              ? "failed"
              : nextCart.currentState === "awaiting_payment"
                ? "pending"
                : null,
        );
      } catch (err) {
        if (err instanceof CartRequestError && err.status === 401) {
          setRequiresSignIn(true);
          setError(props.signInRequiredLabel);
        } else {
          setError(err instanceof Error ? err.message : "Cart unavailable");
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener(CART_UPDATED_EVENT, load);
    return () => window.removeEventListener(CART_UPDATED_EVENT, load);
  }, [props.signInRequiredLabel]);

  async function updateItem(productId: string, quantity: number) {
    setUpdatingProduct(productId);
    try {
      await execute({ action: "updateCartItem", params: { productId, quantity } });
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cart update failed");
    } finally {
      setUpdatingProduct(null);
    }
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      await execute({ action: "checkout" });
    } catch {
      setError(props.paymentFailedLabel);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const items = cart?.context.items ?? [];
  const pricedItems = items.map((item) => ({ ...item, product: getCachedProduct(item.productId) }));
  const total = pricedItems.reduce(
    (sum, item) => sum + (item.product?.price ?? 0) * item.quantity,
    0,
  );
  const currency = cart?.context.currency?.toUpperCase() ?? "CAD";
  return (
    <aside className="sticky bottom-4 z-10 mx-auto mt-8 w-full max-w-3xl rounded-xl border bg-card/95 p-5 shadow-lg backdrop-blur">
      {expanded && (
        <div className="mb-4 border-b pb-4">
          {items.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{props.emptyLabel}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {pricedItems.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-4">
                  <span className="min-w-0 flex-1 truncate">
                    {item.product?.title ?? item.productId}
                  </span>
                  <span>
                    {item.product
                      ? formatProductPrice(item.product.price * item.quantity, currency)
                      : props.priceUnavailableLabel}
                  </span>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    aria-label={`${props.decreaseQuantityLabel}: ${item.product?.title ?? item.productId}`}
                    disabled={updatingProduct === item.productId || item.quantity <= 1}
                    onClick={() => void updateItem(item.productId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="min-w-5 text-center tabular-nums">{item.quantity}</span>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    aria-label={`${props.increaseQuantityLabel}: ${item.product?.title ?? item.productId}`}
                    disabled={updatingProduct === item.productId || item.quantity >= 999}
                    onClick={() => void updateItem(item.productId, item.quantity + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="text-xs underline"
                    disabled={updatingProduct === item.productId}
                    onClick={() => void updateItem(item.productId, 0)}
                  >
                    {props.removeItemLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">{props.loadingLabel}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? props.itemLabel : props.itemsLabel}
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {paymentStatus === "pending" && (
            <p className="text-sm text-muted-foreground" role="status">
              {props.paymentPendingLabel}
            </p>
          )}
          {paymentStatus === "success" && (
            <p className="text-sm text-green-600" role="status">
              {props.paymentSuccessLabel}
            </p>
          )}
          {paymentStatus === "failed" && (
            <p className="text-sm text-destructive" role="alert">
              {props.paymentFailedLabel}
            </p>
          )}
          {requiresSignIn && (
            <a className="text-sm font-medium underline" href="/login">
              {props.signInLabel}
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{formatProductPrice(total, currency)}</span>
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? props.hideCartLabel : props.viewCartLabel}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={
              loading ||
              checkoutLoading ||
              items.length === 0 ||
              pricedItems.some((item) => !item.product)
            }
            onClick={() => void startCheckout()}
          >
            {props.checkoutLabel}
          </button>
        </div>
      </div>
    </aside>
  );
}

export const commerceComponents = {
  Hero,
  ProductCard,
  ProductGrid,
  ProductInfo,
  CartSummary,
  CartDrawer,
  CheckoutButton,
  CollectionPage,
  SearchResults,
  Pagination,
  OrdersAdmin,
};
