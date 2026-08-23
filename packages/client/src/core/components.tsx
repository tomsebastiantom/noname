import { AccountNotificationPrefsForm } from "./components/AccountNotificationPrefsForm";
import { AccountNotificationsInbox } from "./components/AccountNotificationsInbox";
import { AuthLayout } from "./components/AuthLayout";
import { LoginForm } from "./components/LoginForm";
import { MountAction } from "./components/MountAction";
import type { ComponentCtx } from "./components/types";

export { AccountNotificationPrefsForm } from "./components/AccountNotificationPrefsForm";
export { AccountNotificationsInbox } from "./components/AccountNotificationsInbox";
export { AuthLayout } from "./components/AuthLayout";
export { LoginForm } from "./components/LoginForm";
export { MountAction } from "./components/MountAction";
export type { ComponentCtx } from "./components/types";

export function GridBase({ props, children }: ComponentCtx<{ columns: number; gap: number }>) {
  const { columns, gap } = props;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: gap,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

export function StackBase({
  props,
  children,
}: ComponentCtx<{
  direction: "row" | "column";
  gap: number;
  align: "start" | "center" | "end" | "stretch";
}>) {
  const { direction, gap, align } = props;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        gap: gap,
        alignItems: align,
      }}
    >
      {children}
    </div>
  );
}

export function TextBase({
  props,
}: ComponentCtx<{
  content: string;
  variant: "h1" | "h2" | "h3" | "body" | "caption";
  align: "left" | "center" | "right";
}>) {
  const { content, variant, align } = props;
  const styles: Record<string, React.CSSProperties> = {
    h1: { fontSize: "2rem", fontWeight: 700, margin: "0 0 16px" },
    h2: { fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px" },
    h3: { fontSize: "1.2rem", fontWeight: 600, margin: "0 0 8px" },
    body: { fontSize: "1rem", lineHeight: 1.6 },
    caption: { fontSize: "0.85rem", color: "#888" },
  };

  const style = { ...styles[variant], textAlign: align } as React.CSSProperties;

  switch (variant) {
    case "h1":
      return <h1 style={style}>{content}</h1>;
    case "h2":
      return <h2 style={style}>{content}</h2>;
    case "h3":
      return <h3 style={style}>{content}</h3>;
    default:
      return <p style={style}>{content}</p>;
  }
}

export function ButtonBase({
  props,
  emit,
}: ComponentCtx<{
  label: string;
  variant: "primary" | "secondary" | "outline";
  action: string | null;
}>) {
  const { label, variant, action } = props;
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
        ...variantStyles[variant],
      }}
      onClick={() => action && emit?.(action)}
    >
      {label}
    </button>
  );
}

export function ImageBase({
  props,
}: ComponentCtx<{
  src: string;
  alt: string;
  fit: "cover" | "contain" | "fill";
  width: number | null;
  height: number | null;
}>) {
  const { src, alt, fit, width, height } = props;
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: width ?? "100%",
        height: height ?? "auto",
        objectFit: fit,
      }}
    />
  );
}

/** json-render component map for layout primitives, auth shell, and mount hooks. */
export const coreComponents = {
  GridBase,
  StackBase,
  TextBase,
  ButtonBase,
  ImageBase,
  LoginForm,
  AuthLayout,
  AccountNotificationsInbox,
  AccountNotificationPrefsForm,
  MountAction,
};
