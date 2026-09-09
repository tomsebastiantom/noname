import { isRichTextDocument } from "@noname/documents";
import { useEffect, useState } from "react";
import { RichTextRenderer } from "../shared/RichTextRenderer";
import type { ComponentCtx } from "../types";
import { commerceActions } from "./actions";
import { CartRequestError, getCart } from "./cart";

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
  image: string | null;
  description: unknown;
};

const CART_UPDATED_EVENT = "noname:cart-updated";

export function ProductCard({ props }: ComponentCtx<ProductCardProps>) {
  const labels = props;
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onAddToCart() {
    setLoading(true);
    setStatus(null);
    try {
       await commerceActions.addToCart({
        productId: props.productId,
        quantity: 1,
        price: props.price,
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
          <span className="text-xl font-bold">${props.price.toFixed(2)}</span>
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

type CartSummaryProps = {
  title: string;
  checkoutLabel: string;
  viewCartLabel: string;
  hideCartLabel: string;
  loadingLabel: string;
  itemLabel: string;
  itemsLabel: string;
  priceUnavailableLabel: string;
  signInLabel: string;
  signInRequiredLabel: string;
  paymentPendingLabel: string;
  paymentSuccessLabel: string;
  paymentFailedLabel: string;
};

export function CartSummary({ props }: ComponentCtx<CartSummaryProps>) {
  const [cart, setCart] = useState<{ context: { items?: CartItem[]; total?: number; currency?: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "success" | "failed" | null>(null);

  useEffect(() => {
    setRequiresSignIn(false);
    const load = async () => {
      try {
         const nextCart = await getCart();
         setCart(nextCart);
         setError(null);
         setPaymentStatus(nextCart.currentState === "paid" ? "success" : nextCart.currentState === "payment_failed" ? "failed" : nextCart.currentState === "awaiting_payment" ? "pending" : null);
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

  const items = cart?.context.items ?? [];
  const total = items.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0) / 100;
  const currency = cart?.context.currency?.toUpperCase() ?? "CAD";
  return (
    <aside className="sticky bottom-4 z-10 mx-auto mt-8 w-full max-w-3xl rounded-xl border bg-card/95 p-5 shadow-lg backdrop-blur">
      {expanded && items.length > 0 && (
        <div className="mb-4 border-b pb-4">
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li key={`${item.productId}-${item.price ?? "unknown"}`} className="flex justify-between gap-4">
                <span>{item.productId} × {item.quantity}</span>
                <span>{item.price === undefined ? props.priceUnavailableLabel : `${((item.price * item.quantity) / 100).toFixed(2)} ${currency}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          {loading ? <p className="text-sm text-muted-foreground">{props.loadingLabel}</p> : <p className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? props.itemLabel : props.itemsLabel}</p>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {paymentStatus === "pending" && <p className="text-sm text-muted-foreground" role="status">{props.paymentPendingLabel}</p>}
          {paymentStatus === "success" && <p className="text-sm text-green-600" role="status">{props.paymentSuccessLabel}</p>}
          {paymentStatus === "failed" && <p className="text-sm text-destructive" role="alert">{props.paymentFailedLabel}</p>}
          {requiresSignIn && <a className="text-sm font-medium underline" href="/login">{props.signInLabel}</a>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{total.toFixed(2)} {currency}</span>
          <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium" onClick={() => setExpanded((value) => !value)}>{expanded ? props.hideCartLabel : props.viewCartLabel}</button>
          <button type="button" className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={loading || items.length === 0 || items.some((item) => item.price === undefined)} onClick={() => void commerceActions.checkout()}>{props.checkoutLabel}</button>
        </div>
      </div>
    </aside>
  );
}

export const commerceComponents = {
  Hero,
  ProductCard,
  CartSummary,
};
