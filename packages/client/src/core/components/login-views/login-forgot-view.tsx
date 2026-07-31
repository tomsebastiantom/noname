import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

export function LoginForgotView({
  email,
  state,
  onEmailChange,
  onSubmit,
  onBack,
}: {
  email: string;
  state: LoginAlertState;
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
      <LoginFormAlerts state={state} />
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
