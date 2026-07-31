import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

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
  state: LoginAlertState;
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
      <LoginFormAlerts state={state} />
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
