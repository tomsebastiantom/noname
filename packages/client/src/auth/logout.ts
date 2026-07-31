import { clearObservabilityUser } from "../platform/browser-observability";
import { clearSession } from "./session";

export function performLogout(): void {
  clearObservabilityUser();
  clearSession();
  sessionStorage.removeItem("noname_mfa_login");
  window.location.href = "/login";
}
