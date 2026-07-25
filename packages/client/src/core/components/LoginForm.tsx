import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
      <p className="text-center text-sm text-destructive">
        Use {"{orgId}"}.localhost:5173/login
      </p>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.subtitle && <CardDescription>{props.subtitle}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
