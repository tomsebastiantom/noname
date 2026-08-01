import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Separator } from "../../../components/ui/separator";
import type { LoginViewFields } from "../../login-form-labels";
import { SocialLoginButtons } from "../SocialLoginButtons";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

type LoginFields = LoginViewFields["login"]["fields"];

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
  fields,
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
  fields: LoginFields;
  state: LoginAlertState;
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
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              {showSocial ? fields.dividerWithSocial : fields.dividerEmailOnly}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{fields.email}</Label>
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
            <Label htmlFor="password">{fields.password}</Label>
            {allowPasswordReset && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={onForgot}
              >
                {fields.forgotPasswordLink}
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
                {showPassword ? fields.hidePassword : fields.showPassword}
              </Button>
            )}
          </div>
        </div>

        <LoginFormAlerts state={state} />

        <Button type="submit" disabled={state.loading} className="w-full">
          {state.loading ? fields.submitting : fields.submit}
        </Button>

        {allowSignUp && (
          <p className="text-center text-sm text-muted-foreground">
            {fields.noAccountPrompt}{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={onSignup}
            >
              {fields.createAccountLink}
            </button>
          </p>
        )}

        {footerText && <p className="text-center text-xs text-muted-foreground">{footerText}</p>}
      </form>
    </>
  );
}
