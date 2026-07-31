import type { FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { LoginFormAlerts } from "./login-form-alerts";
import type { LoginAlertState } from "./types";

export function LoginResetView({
  newPassword,
  state,
  onPasswordChange,
  onSubmit,
}: {
  newPassword: string;
  state: LoginAlertState;
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
      <LoginFormAlerts state={state} />
      <Button type="submit" disabled={state.loading} className="w-full">
        {state.loading ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
