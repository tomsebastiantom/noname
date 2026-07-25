import { type AuthProvider, saveAuthConfig } from "../../auth/auth-settings";
import { startIdpLogin } from "../../auth/idp-login";
import { loginWithPassword } from "../../auth/login";
import { requireStoreSlug } from "../../auth/org";
import { clearSession } from "../../auth/session";

export const authActions = {
  saveAuthConfig: async (params: unknown) => {
    const { providers, allowPassword, googleOAuth, githubOAuth, appleOAuth } = params as {
      providers: AuthProvider[];
      allowPassword: boolean;
      googleOAuth?: { clientId: string; clientSecret: string };
      githubOAuth?: { clientId: string; clientSecret: string };
      appleOAuth?: { clientId: string; teamId: string; keyId: string; privateKey: string };
    };

    await saveAuthConfig({ providers, allowPassword, googleOAuth, githubOAuth, appleOAuth });
  },

  login: async (params: unknown) => {
    const { email, password, redirectPath } = params as {
      email: string;
      password: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    await loginWithPassword(storeSlug, email, password);
    window.location.href = redirectPath ?? "/";
  },

  idpLogin: async (params: unknown) => {
    const { provider, redirectPath } = params as {
      provider: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    await startIdpLogin(storeSlug, provider, redirectPath ?? "/");
  },

  logout: async () => {
    clearSession();
    window.location.href = "/login";
  },
};
