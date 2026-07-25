import { loginWithCredentials } from "./zitadel-client";
import type { AuthService } from "./ports";

export function createAuthService(): AuthService {
  return {
    login: (input) => loginWithCredentials(input),
  };
}
