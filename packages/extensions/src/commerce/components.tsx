import { useState } from "react";
import type { ComponentCtx } from "../types";
import { commerceActions } from "./actions";

export function Hero({
  props,
  emit,
}: ComponentCtx<{
  title: string;
  subtitle: string | null;
  image: string | null;
  ctaLabel: string | null;
  ctaAction: string | null;
}>) {
  return (
    <section className="bg-muted/50 px-6 py-16 text-center">
      {props.image && (
        <img
          src={props.image}
          alt={props.title}
          className="mx-auto max-h-[400px] max-w-full rounded-lg object-cover"
        />
      )}
      <h1 className="mt-6 text-4xl font-bold tracking-tight">{props.title}</h1>
      {props.subtitle && (
        <p className="mx-auto mt-2 max-w-2xl text-lg text-muted-foreground">{props.subtitle}</p>
      )}
      {props.ctaLabel && (
        <button
          type="button"
          className="mt-6 inline-flex items-center rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => props.ctaAction && emit?.(props.ctaAction)}
        >
          {props.ctaLabel}
        </button>
      )}
    </section>
  );
}

export function ProductCard({
  props,
}: ComponentCtx<{
  productId: string;
  title: string;
  price: number;
  image: string | null;
  description: string | null;
}>) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onAddToCart() {
    setLoading(true);
    setStatus(null);
    try {
      await commerceActions.addToCart({
        productId: props.productId,
        quantity: 1,
      });
      setStatus("Added to cart");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not add to cart");
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
        {props.description && (
          <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xl font-bold">${props.price.toFixed(2)}</span>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={loading}
            onClick={() => void onAddToCart()}
          >
            {loading ? "Adding…" : "Add to Cart"}
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

export const commerceComponents = {
  Hero,
  ProductCard,
};
