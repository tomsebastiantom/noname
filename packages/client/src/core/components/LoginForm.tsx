import { useActions } from "@json-render/react";
import { storeSlugFromHost } from "@noname/shared";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { CatalogProps } from "../../schemas/shared";
import type { CoreActionName } from "../actions";
import type { LoginViewFields } from "../login-form-labels";
import {
  type AuthProvider,
  type LoginView,
  safeRedirect,
  viewFromSearch,
} from "./login-form-types";
import {
  LoginCredentialsView,
  LoginForgotView,
  LoginMfaView,
  LoginResetView,
  LoginSignupView,
} from "./login-views";
import type { ComponentCtx } from "./types";

type LoginFormConfig = {
  redirectPath: string | null;
  logoUrl: string | null;
  showPasswordToggle: boolean;
  providers: AuthProvider[];
};

type LoginFormLabels = {
  views: LoginViewFields;
  footerText: string | null;
  providers: Record<string, string>;
  messages: {
    noSignInMethods: string;
    passwordResetSent: string;
    passwordUpdated: string;
    invalidHost: string;
  };
};

export function LoginForm({ props }: ComponentCtx<CatalogProps<LoginFormConfig, LoginFormLabels>>) {
  const { config, labels } = props;
  const { execute } = useActions();
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

  const storeSlug = storeSlugFromHost(window.location.hostname);
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<LoginView>(() => viewFromSearch(search));

  const redirectFromQuery = safeRedirect(search.get("redirect"));
  const redirectPath = redirectFromQuery ?? config.redirectPath ?? "/";

  const resetUserId = search.get("userID") ?? "";
  const resetCode = search.get("code") ?? "";

  useEffect(() => {
    if (!storeSlug) return;
    void fetch(`/api/auth/${storeSlug}/config`)
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
        const fromSpec = (config.providers ?? []) as string[];
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
  }, [storeSlug, config.providers]);

  const mergedProviderLabels = useMemo(() => {
    const merged: Record<string, string> = { ...providerLabels };
    for (const [key, value] of Object.entries(labels.providers ?? {})) {
      if (value) merged[key] = value;
    }
    return merged;
  }, [providerLabels, labels.providers]);

  const showSocial = enabledProviders.length > 0 && view === "login";
  const showPasswordForm = allowPassword && (view === "login" || view === "signup");
  const alertState = { error, info, loading };

  async function runAction(action: CoreActionName, payload: Record<string, unknown>) {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await execute({ action, params: payload });
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
      await runAction("requestPasswordReset", { email });
      setInfo(labels.messages.passwordResetSent);
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
      await runAction("confirmPasswordReset", {
        userId: resetUserId,
        verificationCode: resetCode,
        newPassword,
      });
      setInfo(labels.messages.passwordUpdated);
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
        <AlertDescription>{labels.messages.invalidHost}</AlertDescription>
      </Alert>
    );
  }

  const viewLabels = labels.views[view];
  const title = viewLabels.title;
  const subtitle = viewLabels.description;

  return (
    <Card className="w-full border shadow-sm">
      <CardHeader className="space-y-3 text-center">
        {config.logoUrl && (
          <img src={config.logoUrl} alt="" className="mx-auto h-10 w-auto object-contain" />
        )}
        <div className="space-y-1">
          <CardTitle className="text-2xl">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {view === "login" && showPasswordForm && (
          <LoginCredentialsView
            email={email}
            password={password}
            showPassword={showPassword}
            showPasswordToggle={config.showPasswordToggle}
            showSocial={showSocial}
            allowPasswordReset={allowPasswordReset}
            allowSignUp={allowSignUp}
            enabledProviders={enabledProviders}
            redirectPath={redirectPath}
            providerLabels={mergedProviderLabels}
            providerIcons={providerIcons}
            footerText={labels.footerText}
            fields={labels.views.login.fields}
            state={alertState}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
            onSubmit={onLoginSubmit}
            onForgot={() => setView("forgot")}
            onSignup={() => setView("signup")}
          />
        )}

        {view === "forgot" && allowPasswordReset && (
          <LoginForgotView
            email={email}
            fields={labels.views.forgot.fields}
            state={alertState}
            onEmailChange={setEmail}
            onSubmit={onForgotSubmit}
            onBack={() => setView("login")}
          />
        )}

        {view === "reset" && allowPasswordReset && resetUserId && (
          <LoginResetView
            newPassword={newPassword}
            fields={labels.views.reset.fields}
            state={alertState}
            onPasswordChange={setNewPassword}
            onSubmit={onResetSubmit}
          />
        )}

        {view === "signup" && allowSignUp && (
          <LoginSignupView
            email={email}
            password={password}
            givenName={givenName}
            familyName={familyName}
            fields={labels.views.signup.fields}
            state={alertState}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onGivenNameChange={setGivenName}
            onFamilyNameChange={setFamilyName}
            onSubmit={onSignupSubmit}
            onBack={() => setView("login")}
          />
        )}

        {view === "mfa" && (
          <LoginMfaView
            totpCode={totpCode}
            fields={labels.views.mfa.fields}
            state={alertState}
            onTotpChange={setTotpCode}
            onSubmit={onMfaSubmit}
            onBack={() => {
              sessionStorage.removeItem("noname_mfa_login");
              setView("login");
            }}
          />
        )}

        {view === "login" && !showPasswordForm && !showSocial && (
          <Alert>
            <AlertDescription>{labels.messages.noSignInMethods}</AlertDescription>
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
