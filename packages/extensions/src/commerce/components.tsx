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
    <section style={{ padding: "64px 24px", textAlign: "center", background: "#f5f5f5" }}>
      {props.image && (
        <img
          src={props.image}
          alt={props.title}
          style={{ maxWidth: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 8 }}
        />
      )}
      <h1 style={{ fontSize: "2.5rem", margin: "24px 0 8px" }}>{props.title}</h1>
      {props.subtitle && (
        <p style={{ fontSize: "1.2rem", color: "#666", marginBottom: 24 }}>{props.subtitle}</p>
      )}
      {props.ctaLabel && (
        <button
          type="button"
          style={{ padding: "12px 32px", fontSize: "1rem", cursor: "pointer" }}
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
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {props.image && (
        <img
          src={props.image}
          alt={props.title}
          style={{ width: "100%", height: 200, objectFit: "cover" }}
        />
      )}
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>{props.title}</h3>
        {props.description && (
          <p style={{ color: "#666", fontSize: "0.9rem", margin: "0 0 12px" }}>
            {props.description}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", fontSize: "1.2rem" }}>${props.price.toFixed(2)}</span>
          <button
            type="button"
            style={{ padding: "8px 16px", cursor: loading ? "not-allowed" : "pointer" }}
            disabled={loading}
            onClick={() => void onAddToCart()}
          >
            {loading ? "Adding…" : "Add to Cart"}
          </button>
        </div>
        {status && (
          <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#444" }}>{status}</p>
        )}
      </div>
    </div>
  );
}

export const commerceComponents = {
  Hero,
  ProductCard,
};
