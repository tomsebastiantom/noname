import type { AuthService } from "./ports";
import {
  buildOAuthAuthorizeUrl,
  exchangeAuthorizationCode,
  listEnabledProviders,
  loginWithCredentials,
  resolveIdpId,
} from "./zitadel-client";

export function createAuthService(): AuthService {
  return {
    login: (input) => loginWithCredentials(input),

    async getConfig(_orgId) {
      return {
        providers: listEnabledProviders(),
        allowPassword: true,
      };
    },

    async startIdpLogin(input) {
      const idpId = resolveIdpId(input.provider);
      if (!idpId) {
        throw new Error(`Identity provider "${input.provider}" is not configured`);
      }

      const authorizeUrl = await buildOAuthAuthorizeUrl({
        orgId: input.orgId,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        idpId,
      });

      return { authorizeUrl };
    },

    exchangeOAuthCallback: (input) => exchangeAuthorizationCode(input),
  };
}
