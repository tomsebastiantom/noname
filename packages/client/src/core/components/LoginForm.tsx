import { type FormEvent, useEffect, useMemo, useState } from "react";
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

type LoginView = "login" | "forgot" | "reset" | "signup" | "mfa";

function safeRedirect(path: string | null | undefined): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function viewFromSearch(search: URLSearchParams): LoginView {
  if (search.get("mfa") === "1") return "mfa";
  if (search.get("userID") && search.get("code")) return "reset";
  if (search.get("signup") === "1") return "signup";
  if (search.get("forgot") === "1") return "forgot";
  return "login";
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
  const [newPassword, setNewPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [providerIcons, setProviderIcons] = useState<Record<string, string>>({});
  const [allowPassword, setAllowPassword] = useState(true);
  const [allowSignUp, setAllowSignUp] = useState(false);
  const [allowPasswordReset, setAllowPasswordReset] = useState(true);

  const storeSlug = storeSlugFromHostname(window.location.hostname);
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<LoginView>(() => viewFromSearch(search));

  const redirectFromQuery = safeRedirect(search.get("redirect"));
  const redirectPath = redirectFromQuery ?? props.redirectPath ?? "/";

  const resetUserId = search.get("userID") ?? "";
  const resetCode = search.get("code") ?? "";

  useEffect(() => {
    if (!storeSlug) return;
    void fetch(`/api/tenants/${storeSlug}/auth/config`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              data?: {
                providers?: string[];
                allowPassword?: boolean;
                allowSignUp?: boolean;
                allowPasswordReset?: boolean;
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
        setAllowPassword(body?.data?.allowPassword !== false);
        setAllowSignUp(body?.data?.allowSignUp === true);
        setAllowPasswordReset(body?.data?.allowPasswordReset !== false);
        setProviderLabels(body?.data?.providerLabels ?? {});
        setProviderIcons(body?.data?.providerIcons ?? {});
      })
      .catch(() => {
        setEnabledProviders([]);
        setAllowPassword(true);
        setAllowSignUp(false);
        setAllowPasswordReset(true);
        setProviderLabels({});
        setProviderIcons({});
      });
  }, [storeSlug, props.providers]);

  const showSocial = enabledProviders.length > 0 && view === "login";
  const showPasswordForm = allowPassword && (view === "login" || view === "signup");

  async function runAction(action: string, payload: Record<string, unknown>) {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await executeAction(action, payload, () => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  async function onLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;
    await runAction("login", { email, password, redirectPath });
  }

  async function onForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;
    setLoading(true);
    setError(null);
    try {
      await executeAction("requestPasswordReset", { email }, () => {});
      setInfo("If an account exists for that email, we sent reset instructions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onResetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug || !resetUserId) return;
    setLoading(true);
    setError(null);
    try {
      await executeAction(
        "confirmPasswordReset",
        {
          userId: resetUserId,
          verificationCode: resetCode,
          newPassword,
        },
        () => {},
      );
      setInfo("Password updated. You can sign in now.");
      setView("login");
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(redirectPath)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSignupSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;
    await runAction("register", {
      email,
      password,
      givenName: givenName || undefined,
      familyName: familyName || undefined,
      redirectPath: "/login",
    });
  }

  async function onMfaSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;
    await runAction("verifyMfa", { totpCode, redirectPath });
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

  const titles: Record<LoginView, string> = {
    login: props.title,
    forgot: "Forgot password",
    reset: "Set new password",
    signup: "Create account",
    mfa: "Verify your identity",
  };

  const subtitles: Record<LoginView, string | null> = {
    login: props.subtitle,
    forgot: "Enter your email and we will send reset instructions.",
    reset: "Choose a new password for your account.",
    signup: "Register with email and password.",
    mfa: "Enter the code from your authenticator app.",
  };

  return (
    <Card className="w-full border shadow-sm">
      <CardHeader className="space-y-3 text-center">
        {props.logoUrl && (
          <img src={props.logoUrl} alt="" className="mx-auto h-10 w-auto object-contain" />
        )}
        <div className="space-y-1">
          <CardTitle className="text-2xl">{titles[view]}</CardTitle>
          {subtitles[view] && <CardDescription>{subtitles[view]}</CardDescription>}
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

        {view === "login" && showPasswordForm && (
          <form onSubmit={(e) => void onLoginSubmit(e)} className="flex flex-col gap-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {allowPasswordReset && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setView("forgot")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
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
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>

            {allowSignUp && (
              <p className="text-center text-sm text-muted-foreground">
                No account?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setView("signup")}
                >
                  Create one
                </button>
              </p>
            )}

            {props.footerText && (
              <p className="text-center text-xs text-muted-foreground">{props.footerText}</p>
            )}
          </form>
        )}

        {view === "forgot" && allowPasswordReset && (
          <form onSubmit={(e) => void onForgotSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setView("login")}
            >
              Back to sign in
            </button>
          </form>
        )}

        {view === "reset" && allowPasswordReset && resetUserId && (
          <form onSubmit={(e) => void onResetSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}

        {view === "signup" && allowSignUp && (
          <form onSubmit={(e) => void onSignupSubmit(e)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="given-name">First name</Label>
                <Input
                  id="given-name"
                  autoComplete="given-name"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="family-name">Last name</Label>
                <Input
                  id="family-name"
                  autoComplete="family-name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating account…" : "Create account"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setView("login")}
            >
              Back to sign in
            </button>
          </form>
        )}

        {view === "mfa" && (
          <form onSubmit={(e) => void onMfaSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="totp">Authentication code</Label>
              <Input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Verifying…" : "Continue"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                sessionStorage.removeItem("noname_mfa_login");
                setView("login");
              }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {view === "login" && !showPasswordForm && !showSocial && (
          <Alert>
            <AlertDescription>No sign-in methods are enabled for this store.</AlertDescription>
          </Alert>
        )}

        {view === "login" && !showPasswordForm && showSocial && error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
