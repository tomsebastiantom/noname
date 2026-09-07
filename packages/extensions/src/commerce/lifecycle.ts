import type { ExtensionLifecycle } from "../index";
import { mergeGuestCartOnLogin } from "./cart";

/** Commerce lifecycle callbacks — wired once by the platform catalog loader. */
export const commerceLifecycle: ExtensionLifecycle = {
  onLogin: () => void mergeGuestCartOnLogin(),
};
