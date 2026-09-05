import type { ComponentFn } from "@json-render/react";
import { catalog } from "../catalog";

export const Hero: ComponentFn<typeof catalog, "Hero"> = ({ props, emit }) => {
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
};

export const ProductCard: ComponentFn<typeof catalog, "ProductCard"> = ({ props, emit }) => {
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
            style={{ padding: "8px 16px", cursor: "pointer" }}
            onClick={() => emit?.("addToCart")}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export const GridBase: ComponentFn<typeof catalog, "GridBase"> = ({ props, children }) => {
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
};

export const StackBase: ComponentFn<typeof catalog, "StackBase"> = ({
  props,
  children,
}) => {
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
};

export const TextBase: ComponentFn<typeof catalog, "TextBase"> = ({ props }) => {
  const styles: Record<string, React.CSSProperties> = {
    h1: { fontSize: "2rem", fontWeight: 700, margin: "0 0 16px" },
    h2: { fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px" },
    h3: { fontSize: "1.2rem", fontWeight: 600, margin: "0 0 8px" },
    body: { fontSize: "1rem", lineHeight: 1.6 },
    caption: { fontSize: "0.85rem", color: "#888" },
  };

  const style = { ...styles[props.variant], textAlign: props.align } as React.CSSProperties;

  switch (props.variant) {
    case "h1":
      return <h1 style={style}>{props.content}</h1>;
    case "h2":
      return <h2 style={style}>{props.content}</h2>;
    case "h3":
      return <h3 style={style}>{props.content}</h3>;
    case "caption":
      return <p style={style}>{props.content}</p>;
    default:
      return <p style={style}>{props.content}</p>;
  }
};

export const ButtonBase: ComponentFn<typeof catalog, "ButtonBase"> = ({ props, emit }) => {
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
};

export const ImageBase: ComponentFn<typeof catalog, "ImageBase"> = ({ props }) => {
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
};