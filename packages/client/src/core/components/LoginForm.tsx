import { type FormEvent, useEffect, useState } from "react";
import { storeSlugFromHostname } from "../../auth/org";
import { Alert, AlertDescription } from "../../components/ui/alert";
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
import { Separator } from "../../components/ui/separator";
import { executeAction } from "../../platform/registry";
import { SocialLoginButtons } from "./SocialLoginButtons";
import type { ComponentCtx } from "./types";

type AuthProvider = "google" | "github" | "apple" | (string & {});

function safeRedirect(path: string | null | undefined): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function LoginForm({
  props,
}: ComponentCtx<{
  title: string;
  subtitle: string | null;
  redirectPath: string | null;
  logoUrl: string | null;
  showPasswordToggle: boolean;
  footerText: string | null;
  providers: AuthProvider[];
}>) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [providerIcons, setProviderIcons] = useState<Record<string, string>>({});
  const storeSlug = storeSlugFromHostname(window.location.hostname);

  const redirectFromQuery = safeRedirect(
    new URLSearchParams(window.location.search).get("redirect"),
  );
  const redirectPath = redirectFromQuery ?? props.redirectPath ?? "/";

  useEffect(() => {
    if (!storeSlug) return;
    void fetch(`/api/tenants/${storeSlug}/auth/config`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              data?: {
                providers?: string[];
                providerLabels?: Record<string, string>;
                providerIcons?: Record<string, string>;
              };
            }>)
          : null,
      )
      .then((body) => {
        const serverProviders = body?.data?.providers ?? [];
        const fromSpec = (props.providers ?? []) as string[];
        const merged =
          fromSpec.length > 0
            ? serverProviders.filter(
                (p) => fromSpec.includes(p as AuthProvider) || p.startsWith("custom:"),
              )
            : serverProviders;
        setEnabledProviders(merged);
        setProviderLabels(body?.data?.providerLabels ?? {});
        setProviderIcons(body?.data?.providerIcons ?? {});
      })
      .catch(() => {
        setEnabledProviders([]);
        setProviderLabels({});
        setProviderIcons({});
      });
  }, [storeSlug, props.providers]);

  const showSocial = enabledProviders.length > 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;

    setError(null);
    setLoading(true);

    try {
      await executeAction("login", { email, password, redirectPath }, () => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  if (!storeSlug) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Use {"{slug}"}.localhost:5173/login — e.g. yogastore.localhost:5173/login
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full border shadow-sm">
      <CardHeader className="space-y-3 text-center">
        {props.logoUrl && (
          <img src={props.logoUrl} alt="" className="mx-auto h-10 w-auto object-contain" />
        )}
        <div className="space-y-1">
          <CardTitle className="text-2xl">{props.title}</CardTitle>
          {props.subtitle && <CardDescription>{props.subtitle}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showSocial && (
          <SocialLoginButtons
            providers={enabledProviders}
            redirectPath={redirectPath}
            providerLabels={providerLabels}
            providerIcons={providerIcons}
          />
        )}

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {showSocial && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>
          )}

          {!showSocial && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Continue with email</span>
              </div>
            </div>
          )}

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
            <div className="relative">
              <Input
                id="password"
                type={props.showPasswordToggle && showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={props.showPasswordToggle ? "pr-16" : undefined}
              />
              {props.showPasswordToggle && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </Button>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          {props.footerText && (
            <p className="text-center text-xs text-muted-foreground">{props.footerText}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
