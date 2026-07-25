import { AdminShell } from "./components/AdminShell";
import { AuthLayout } from "./components/AuthLayout";
import { AuthSettingsForm } from "./components/AuthSettingsForm";
import { LoginForm } from "./components/LoginForm";
import type { ComponentCtx } from "./components/types";

export { AdminShell } from "./components/AdminShell";
export { AuthLayout } from "./components/AuthLayout";
export { AuthSettingsForm } from "./components/AuthSettingsForm";
export { LoginForm } from "./components/LoginForm";
export type { ComponentCtx } from "./components/types";

export function Grid({
  props,
  children,
}: ComponentCtx<{
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

export function Stack({
  props,
  children,
}: ComponentCtx<{
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

export function Text({
  props,
}: ComponentCtx<{
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
    case "h1":
      return <h1 style={style}>{props.value}</h1>;
    case "h2":
      return <h2 style={style}>{props.value}</h2>;
    case "h3":
      return <h3 style={style}>{props.value}</h3>;
    case "caption":
      return <p style={style}>{props.value}</p>;
    default:
      return <p style={style}>{props.value}</p>;
  }
}

export function Button({
  props,
  emit,
}: ComponentCtx<{
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

export function Image({
  props,
}: ComponentCtx<{
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

export const coreComponents = {
  Grid,
  Stack,
  Text,
  Button,
  Image,
  LoginForm,
  AuthLayout,
  AdminShell,
  AuthSettingsForm,
};
