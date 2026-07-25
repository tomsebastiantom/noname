import type { AuthService } from "./ports";
import { loginWithCredentials } from "./zitadel-client";

export function createAuthService(): AuthService {
  return {
    login: (input) => loginWithCredentials(input),
  };
}
