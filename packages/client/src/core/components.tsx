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

export function Grid({
  props,
  children,
}: ComponentCtx<{
  config: { columns: number; gap: number };
  labels: Record<string, never>;
}>) {
  const { config } = props;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${config.columns}, 1fr)`,
        gap: config.gap,
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
  config: {
    direction: "row" | "column";
    gap: number;
    align: "start" | "center" | "end" | "stretch";
  };
  labels: Record<string, never>;
}>) {
  const { config } = props;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: config.direction,
        gap: config.gap,
        alignItems: config.align,
      }}
    >
      {children}
    </div>
  );
}

export function Text({
  props,
}: ComponentCtx<{
  config: {
    variant: "h1" | "h2" | "h3" | "body" | "caption";
    align: "left" | "center" | "right";
  };
  labels: { content: string };
}>) {
  const { config, labels } = props;
  const styles: Record<string, React.CSSProperties> = {
    h1: { fontSize: "2rem", fontWeight: 700, margin: "0 0 16px" },
    h2: { fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px" },
    h3: { fontSize: "1.2rem", fontWeight: 600, margin: "0 0 8px" },
    body: { fontSize: "1rem", lineHeight: 1.6 },
    caption: { fontSize: "0.85rem", color: "#888" },
  };

  const style = { ...styles[config.variant], textAlign: config.align } as React.CSSProperties;

  switch (config.variant) {
    case "h1":
      return <h1 style={style}>{labels.content}</h1>;
    case "h2":
      return <h2 style={style}>{labels.content}</h2>;
    case "h3":
      return <h3 style={style}>{labels.content}</h3>;
    default:
      return <p style={style}>{labels.content}</p>;
  }
}

export function Button({
  props,
  emit,
}: ComponentCtx<{
  config: {
    variant: "primary" | "secondary" | "outline";
    action: string | null;
  };
  labels: { text: string };
}>) {
  const { config, labels } = props;
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
        ...variantStyles[config.variant],
      }}
      onClick={() => config.action && emit?.(config.action)}
    >
      {labels.text}
    </button>
  );
}

export function Image({
  props,
}: ComponentCtx<{
  config: {
    src: string;
    fit: "cover" | "contain" | "fill";
    width: number | null;
    height: number | null;
  };
  labels: { alt: string };
}>) {
  const { config, labels } = props;
  return (
    <img
      src={config.src}
      alt={labels.alt}
      style={{
        width: config.width ?? "100%",
        height: config.height ?? "auto",
        objectFit: config.fit,
      }}
    />
  );
}

/** json-render component map for layout primitives, auth shell, and mount hooks. */
export const coreComponents = {
  Grid,
  Stack,
  Text,
  Button,
  Image,
  LoginForm,
  AuthLayout,
  AccountNotificationsInbox,
  AccountNotificationPrefsForm,
  MountAction,
};
