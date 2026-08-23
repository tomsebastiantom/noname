import { useActions, useStateValue } from "@json-render/react";
import { storeSlugFromHost } from "@noname/shared";
import { type FormEvent, useMemo, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { CoreActionName } from "../actions";
import type { LoginViewFields } from "../login-form-labels";
import { LOGIN_STATE, type LoginAuthConfigState } from "../login-state";
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
import { useMountAction } from "./MountAction";
import type { ComponentCtx } from "./types";

export function LoginForm({
  props,
}: ComponentCtx<{
  redirectPath: string | null;
  logoUrl: string | null;
  showPasswordToggle: boolean;
  providerList: string[];
  footerText: string | null;
  providers: Record<string, string>;
  messages: {
    noSignInMethods: string;
    passwordResetSent: string;
    passwordUpdated: string;
    invalidHost: string;
  };
  views: LoginViewFields;
}>) {
  const {
    redirectPath,
    logoUrl,
    showPasswordToggle,
    providerList,
    footerText,
    providers,
    messages,
    views,
  } = props;
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

  const storeSlug = storeSlugFromHost(window.location.hostname);
  const loadParams = useMemo(() => (storeSlug ? { storeSlug } : null), [storeSlug]);
  useMountAction("loadLoginConfig", loadParams);

  const authConfig = useStateValue(LOGIN_STATE.authConfig) as LoginAuthConfigState | null;

  const enabledProviders = useMemo(() => {
    const serverProviders = authConfig?.providers ?? [];
    const fromSpec = providerList;
    if (fromSpec.length === 0) return serverProviders;
    return serverProviders.filter(
      (p) => fromSpec.includes(p as AuthProvider) || p.startsWith("custom:"),
    );
  }, [authConfig?.providers, providerList]);

  const allowPassword = authConfig?.allowPassword !== false;
  const allowSignUp = authConfig?.allowSignUp === true;
  const allowPasswordReset = authConfig?.allowPasswordReset !== false;
  const providerLabels = authConfig?.providerLabels ?? {};
  const providerIcons = authConfig?.providerIcons ?? {};

  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<LoginView>(() => viewFromSearch(search));

  const redirectFromQuery = safeRedirect(search.get("redirect"));
  const finalRedirectPath = redirectFromQuery ?? redirectPath ?? "/";

  const resetUserId = search.get("userID") ?? "";
  const resetCode = search.get("code") ?? "";

  const mergedProviderLabels = useMemo(() => {
    const merged: Record<string, string> = { ...providerLabels };
    for (const [key, value] of Object.entries(providers ?? {})) {
      if (value) merged[key] = value;
    }
    return merged;
  }, [providerLabels, providers]);

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
    await runAction("login", { email, password, redirectPath: finalRedirectPath });
  }

  async function onForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!storeSlug) return;
    setLoading(true);
    setError(null);
    try {
      await runAction("requestPasswordReset", { email });
      setInfo(messages.passwordResetSent);
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
      setInfo(messages.passwordUpdated);
      setView("login");
      window.history.replaceState(
        {},
        "",
        `/login?redirect=${encodeURIComponent(finalRedirectPath)}`,
      );
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
    await runAction("verifyMfa", { totpCode, redirectPath: finalRedirectPath });
  }

  if (!storeSlug) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{messages.invalidHost}</AlertDescription>
      </Alert>
    );
  }

  const viewLabels = views[view] as {
    title: string;
    description: string | null;
    fields?: Record<string, unknown>;
  };
  const title = viewLabels?.title ?? "";
  const subtitle = viewLabels?.description ?? null;

  return (
    <Card className="w-full border shadow-sm">
      <CardHeader className="space-y-3 text-center">
        {logoUrl && <img src={logoUrl} alt="" className="mx-auto h-10 w-auto object-contain" />}
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
            showPasswordToggle={showPasswordToggle}
            showSocial={showSocial}
            allowPasswordReset={allowPasswordReset}
            allowSignUp={allowSignUp}
            enabledProviders={enabledProviders}
            redirectPath={finalRedirectPath}
            providerLabels={mergedProviderLabels}
            providerIcons={providerIcons}
            footerText={footerText}
            fields={views.login.fields}
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
            fields={views.forgot.fields}
            state={alertState}
            onEmailChange={setEmail}
            onSubmit={onForgotSubmit}
            onBack={() => setView("login")}
          />
        )}

        {view === "reset" && allowPasswordReset && resetUserId && (
          <LoginResetView
            newPassword={newPassword}
            fields={views.reset.fields}
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
            fields={views.signup.fields}
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
            fields={views.mfa.fields}
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
            <AlertDescription>{messages.noSignInMethods}</AlertDescription>
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
