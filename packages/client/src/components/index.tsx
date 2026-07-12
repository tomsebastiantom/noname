import type { ReactNode } from "react";

export interface ComponentCtx<P = Record<string, unknown>> {
  props: P;
  children?: ReactNode;
  emit: (event: string) => void;
}

export function Hero({ props, emit }: ComponentCtx<{
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
      {props.subtitle && <p style={{ fontSize: "1.2rem", color: "#666", marginBottom: 24 }}>{props.subtitle}</p>}
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

export function ProductCard({ props, emit }: ComponentCtx<{
  title: string;
  price: number;
  image: string | null;
  description: string | null;
}>) {
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {props.image && (
        <img src={props.image} alt={props.title} style={{ width: "100%", height: 200, objectFit: "cover" }} />
      )}
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>{props.title}</h3>
        {props.description && <p style={{ color: "#666", fontSize: "0.9rem", margin: "0 0 12px" }}>{props.description}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", fontSize: "1.2rem" }}>${props.price.toFixed(2)}</span>
          <button
            type="button"
            style={{ padding: "8px 16px", cursor: "pointer" }}
            onClick={() => emit?.("addToCart")}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

export function Grid({ props, children }: ComponentCtx<{
  columns: number;
  gap: number;
}>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${props.columns}, 1fr)`,
        gap: props.gap,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

export function Stack({ props, children }: ComponentCtx<{
  direction: "row" | "column";
  gap: number;
  align: "start" | "center" | "end" | "stretch";
}>) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: props.direction,
        gap: props.gap,
        alignItems: props.align,
      }}
    >
      {children}
    </div>
  );
}

export function Text({ props }: ComponentCtx<{
  value: string;
  variant: "h1" | "h2" | "h3" | "body" | "caption";
  align: "left" | "center" | "right";
}>) {
  const styles: Record<string, React.CSSProperties> = {
    h1: { fontSize: "2rem", fontWeight: 700, margin: "0 0 16px" },
    h2: { fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px" },
    h3: { fontSize: "1.2rem", fontWeight: 600, margin: "0 0 8px" },
    body: { fontSize: "1rem", lineHeight: 1.6 },
    caption: { fontSize: "0.85rem", color: "#888" },
  };

  const style = { ...styles[props.variant], textAlign: props.align } as React.CSSProperties;

  switch (props.variant) {
    case "h1": return <h1 style={style}>{props.value}</h1>;
    case "h2": return <h2 style={style}>{props.value}</h2>;
    case "h3": return <h3 style={style}>{props.value}</h3>;
    case "caption": return <p style={style}>{props.value}</p>;
    default: return <p style={style}>{props.value}</p>;
  }
}

export function Button({ props, emit }: ComponentCtx<{
  label: string;
  variant: "primary" | "secondary" | "outline";
  action: string | null;
}>) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: "#000", color: "#fff", border: "none" },
    secondary: { background: "#666", color: "#fff", border: "none" },
    outline: { background: "transparent", color: "#000", border: "2px solid #000" },
  };

  return (
    <button
      type="button"
      style={{
        padding: "12px 24px",
        fontSize: "1rem",
        borderRadius: 6,
        cursor: "pointer",
        ...variantStyles[props.variant],
      }}
      onClick={() => props.action && emit?.(props.action)}
    >
      {props.label}
    </button>
  );
}

export function Image({ props }: ComponentCtx<{
  src: string;
  alt: string;
  fit: "cover" | "contain" | "fill";
  width: number | null;
  height: number | null;
}>) {
  return (
    <img
      src={props.src}
      alt={props.alt}
      style={{
        width: props.width ?? "100%",
        height: props.height ?? "auto",
        objectFit: props.fit,
      }}
    />
  );
}
