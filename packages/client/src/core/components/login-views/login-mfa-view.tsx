import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

export function LoginMfaView({
  totpCode,
  state,
  onTotpChange,
  onSubmit,
  onBack,
}: {
  totpCode: string;
  state: LoginAlertState;
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
      <LoginFormAlerts state={state} />
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
