import { startIdpLogin } from "../../auth/idp-login";
import { loginWithPassword } from "../../auth/login";
import { requireOrgId } from "../../auth/org";
import { clearSession } from "../../auth/session";

export const authActions = {
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
