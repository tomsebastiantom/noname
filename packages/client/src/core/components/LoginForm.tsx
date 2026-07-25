import { useState, type FormEvent } from "react";
import { loginWithPassword } from "../../auth/login";
import type { ComponentCtx } from "./types";

function orgIdFromHostname(hostname: string): string | null {
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

export function LoginForm({
  props,
}: ComponentCtx<{
  title: string;
  subtitle: string | null;
  redirectPath: string | null;
}>) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orgId = orgIdFromHostname(window.location.hostname);
  const redirectPath = props.redirectPath ?? "/";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;

    setError(null);
    setLoading(true);

    try {
      await loginWithPassword(orgId, email, password);
      window.location.href = redirectPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  if (!orgId) {
    return (
      <p style={{ color: "#b91c1c", textAlign: "center" }}>
        Use {"{orgId}"}.localhost:5173/login
      </p>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        margin: "0 auto",
        padding: 32,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 600 }}>{props.title}</h1>
      {props.subtitle && (
        <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "0.95rem" }}>
          {props.subtitle}
        </p>
      )}

      <form onSubmit={(e) => void onSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 16,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 16,
            }}
          />
        </label>

        {error && (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 16px",
            fontSize: 16,
            fontWeight: 500,
            border: "none",
            borderRadius: 6,
            background: loading ? "#9ca3af" : "#111827",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
