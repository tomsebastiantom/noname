import { loginWithPassword } from "../../auth/login";
import { clearSession } from "../../auth/session";

function orgIdFromHostname(hostname: string): string | null {
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

export const authActions = {
  login: async (params: unknown) => {
    const { email, password, redirectPath } = params as {
      email: string;
      password: string;
      redirectPath?: string;
    };

    const orgId = orgIdFromHostname(window.location.hostname);
    if (!orgId) {
      throw new Error("Missing org subdomain — use {orgId}.localhost:5173");
    }

    await loginWithPassword(orgId, email, password);
    window.location.href = redirectPath ?? "/";
  },

  logout: async () => {
    clearSession();
    window.location.href = "/login";
  },
};
