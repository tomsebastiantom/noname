import { ValidationError } from "../../shared/domain-error";
import type { TenantAuthConfig } from "../documents/ports";

export function assertPasswordResetEnabled(auth: TenantAuthConfig): void {
  if (!auth.allowPassword || auth.allowPasswordReset === false) {
    throw new ValidationError("passwordReset", "Password reset is not enabled for this store");
  }
}
