import { loadAuthSettings, saveAuthConfig, type AuthProvider } from "../../auth/auth-settings";
import { startIdpLogin } from "../../auth/idp-login";
import { loginWithPassword } from "../../auth/login";
import { requireOrgId } from "../../auth/org";
import { clearSession } from "../../auth/session";

export const authActions = {
  saveAuthConfig: async (params: unknown) => {
    const { providers, allowPassword, googleOAuth } = params as {
      providers: AuthProvider[];
      allowPassword: boolean;
      googleOAuth?: { clientId: string; clientSecret: string };
    };

    await saveAuthConfig({ providers, allowPassword, googleOAuth });
  },

  login: async (params: unknown) => {
    const { email, password, redirectPath } = params as {
      email: string;
      password: string;
      redirectPath?: string;
    };

    const orgId = requireOrgId();
    await loginWithPassword(orgId, email, password);
    window.location.href = redirectPath ?? "/";
  },

  idpLogin: async (params: unknown) => {
    const { provider, redirectPath } = params as {
      provider: string;
      redirectPath?: string;
    };

    const orgId = requireOrgId();
    await startIdpLogin(orgId, provider, redirectPath ?? "/");
  },

  logout: async () => {
    clearSession();
    window.location.href = "/login";
  },
};
