import type { FormEvent } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import { SocialLoginButtons } from "./SocialLoginButtons";

type AlertState = { error: string | null; info: string | null; loading: boolean };

export function LoginCredentialsView({
  email,
  password,
  showPassword,
  showPasswordToggle,
  showSocial,
  allowPasswordReset,
  allowSignUp,
  enabledProviders,
  redirectPath,
  providerLabels,
  providerIcons,
  footerText,
  state,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  onForgot,
  onSignup,
}: {
  email: string;
  password: string;
  showPassword: boolean;
  showPasswordToggle: boolean;
  showSocial: boolean;
  allowPasswordReset: boolean;
  allowSignUp: boolean;
  enabledProviders: string[];
  redirectPath: string;
  providerLabels: Record<string, string>;
  providerIcons: Record<string, string>;
  footerText: string | null;
  state: AlertState;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onForgot: () => void;
  onSignup: () => void;
}) {
  return (
    <>
      {showSocial && (
        <SocialLoginButtons
          providers={enabledProviders}
          redirectPath={redirectPath}
          providerLabels={providerLabels}
          providerIcons={providerIcons}
        />
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {showSocial ? (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
            </div>
          </div>
        ) : (
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
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {allowPasswordReset && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={onForgot}
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPasswordToggle && showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className={showPasswordToggle ? "pr-16" : undefined}
            />
            {showPasswordToggle && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs text-muted-foreground"
                onClick={onTogglePassword}
              >
                {showPassword ? "Hide" : "Show"}
              </Button>
            )}
          </div>
        </div>

        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.info && (
          <Alert>
            <AlertDescription>{state.info}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={state.loading} className="w-full">
          {state.loading ? "Signing in…" : "Sign in"}
        </Button>

        {allowSignUp && (
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={onSignup}
            >
              Create one
            </button>
          </p>
        )}

        {footerText && <p className="text-center text-xs text-muted-foreground">{footerText}</p>}
      </form>
    </>
  );
}

export function LoginForgotView({
  email,
  state,
  onEmailChange,
  onSubmit,
  onBack,
}: {
  email: string;
  state: AlertState;
  onEmailChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.info && (
        <Alert>
          <AlertDescription>{state.info}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={state.loading} className="w-full">
        {state.loading ? "Sending…" : "Send reset link"}
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={onBack}
      >
        Back to sign in
      </button>
    </form>
  );
}

export function LoginResetView({
  newPassword,
  state,
  onPasswordChange,
  onSubmit,
}: {
  newPassword: string;
  state: AlertState;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.info && (
        <Alert>
          <AlertDescription>{state.info}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={state.loading} className="w-full">
        {state.loading ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}

export function LoginSignupView({
  email,
  password,
  givenName,
  familyName,
  state,
  onEmailChange,
  onPasswordChange,
  onGivenNameChange,
  onFamilyNameChange,
  onSubmit,
  onBack,
}: {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  state: AlertState;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onGivenNameChange: (value: string) => void;
  onFamilyNameChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="given-name">First name</Label>
          <Input
            id="given-name"
            autoComplete="given-name"
            value={givenName}
            onChange={(e) => onGivenNameChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="family-name">Last name</Label>
          <Input
            id="family-name"
            autoComplete="family-name"
            value={familyName}
            onChange={(e) => onFamilyNameChange(e.target.value)}
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
          onChange={(e) => onEmailChange(e.target.value)}
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
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.info && (
        <Alert>
          <AlertDescription>{state.info}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={state.loading} className="w-full">
        {state.loading ? "Creating account…" : "Create account"}
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={onBack}
      >
        Back to sign in
      </button>
    </form>
  );
}

export function LoginMfaView({
  totpCode,
  state,
  onTotpChange,
  onSubmit,
  onBack,
}: {
  totpCode: string;
  state: AlertState;
  onTotpChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="totp">Authentication code</Label>
        <Input
          id="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={totpCode}
          onChange={(e) => onTotpChange(e.target.value)}
        />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={state.loading} className="w-full">
        {state.loading ? "Verifying…" : "Continue"}
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={onBack}
      >
        Back to sign in
      </button>
    </form>
  );
}
