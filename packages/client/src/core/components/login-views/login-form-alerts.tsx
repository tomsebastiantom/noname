import { Alert, AlertDescription } from "../../../components/ui/alert";
import type { LoginAlertState } from "./types";

export function LoginFormAlerts({ state }: Readonly<{ state: LoginAlertState }>) {
  return (
    <>
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
    </>
  );
}
