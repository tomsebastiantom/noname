import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { LoginViewFields } from "../../login-form-labels";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

type MfaFields = LoginViewFields["mfa"]["fields"];

export function LoginMfaView({
  totpCode,
  fields,
  state,
  onTotpChange,
  onSubmit,
  onBack,
}: {
  totpCode: string;
  fields: MfaFields;
  state: LoginAlertState;
  onTotpChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="totp">{fields.code}</Label>
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
        {state.loading ? fields.submitting : fields.submit}
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={onBack}
      >
        {fields.back}
      </button>
    </form>
  );
}
