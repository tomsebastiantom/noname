import {
  confirmPasswordReset,
  confirmTotpEnrollment,
  loginWithPassword,
  type MfaLoginState,
  registerAccount,
  requestPasswordReset,
  verifyMfaAndLogin,
} from "../../auth/account-flows";
import { type AuthSettingsState, loadAuthSettings, saveAuthConfig } from "../../auth/auth-settings";
import { startIdpLogin } from "../../auth/idp-login";
import { performLogout } from "../../auth/logout";
import { requireStoreSlug } from "../../auth/org";
import { isLoggedIn } from "../../auth/session";
import { fetchAuthSessionStatus } from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import {
  ACCOUNT_SECURITY_STATE,
  type AccountSecuritySessionState,
  LOGIN_STATE,
  type LoginAuthConfigState,
} from "../login-state";
import type { CatalogActionHandler } from "./types";

export type AuthSettingsLoaded = AuthSettingsState & { loadedAt: number };

function withLoadedAt(settings: AuthSettingsState): AuthSettingsLoaded {
  return { ...settings, loadedAt: Date.now() };
}

export const authActions = {
  loadLoginConfig: (async (params, setState) => {
    const { storeSlug } = (params ?? {}) as { storeSlug?: string };
    if (!storeSlug) {
      setState(LOGIN_STATE.authConfig, null);
      return;
    }
    try {
      const res = await fetch(`/api/auth/${encodeURIComponent(storeSlug)}/config`);
      if (!res.ok) {
        setState(LOGIN_STATE.authConfig, null);
        return;
      }
      const body = (await res.json()) as {
        data?: {
          providers?: string[];
          allowPassword?: boolean;
          allowSignUp?: boolean;
          allowPasswordReset?: boolean;
          providerLabels?: Record<string, string>;
          providerIcons?: Record<string, string>;
        };
      };
      const loaded: LoginAuthConfigState = {
        loadedAt: Date.now(),
        providers: body.data?.providers ?? [],
        allowPassword: body.data?.allowPassword !== false,
        allowSignUp: body.data?.allowSignUp === true,
        allowPasswordReset: body.data?.allowPasswordReset !== false,
        providerLabels: body.data?.providerLabels ?? {},
        providerIcons: body.data?.providerIcons ?? {},
      };
      setState(LOGIN_STATE.authConfig, loaded);
    } catch {
      setState(LOGIN_STATE.authConfig, null);
    }
  }) satisfies CatalogActionHandler,

  loadAccountSecuritySession: (async (_params, setState) => {
    setState(ACCOUNT_SECURITY_STATE.loading, true);
    if (!isLoggedIn()) {
      setState(ACCOUNT_SECURITY_STATE.session, null);
      setState(ACCOUNT_SECURITY_STATE.loading, false);
      return;
    }
    try {
      const status = await fetchAuthSessionStatus();
      const loaded: AccountSecuritySessionState = {
        loadedAt: Date.now(),
        mfaEnrolled: status.mfaEnrolled,
      };
      setState(ACCOUNT_SECURITY_STATE.session, loaded);
    } catch {
      setState(ACCOUNT_SECURITY_STATE.session, null);
    } finally {
      setState(ACCOUNT_SECURITY_STATE.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadAuthSettings: (async (_params, setState) => {
    setState(ADMIN_STATE.authSettings.loading, true);
    setState(ADMIN_STATE.authSettings.error, null);
    try {
      setState(ADMIN_STATE.authSettings.loaded, withLoadedAt(await loadAuthSettings()));
    } catch (err) {
      setState(ADMIN_STATE.authSettings.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.authSettings.loaded, null);
    } finally {
      setState(ADMIN_STATE.authSettings.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveAuthConfig: (async (params, setState) => {
    const {
      allowPassword,
      allowSignUp,
      allowPasswordReset,
      requireMfaForAdmin,
      googleOAuth,
      githubOAuth,
      appleOAuth,
    } = params as {
      allowPassword: boolean;
      allowSignUp?: boolean;
      allowPasswordReset?: boolean;
      requireMfaForAdmin?: boolean;
      googleOAuth?: { clientId: string; clientSecret: string };
      githubOAuth?: { clientId: string; clientSecret: string };
      appleOAuth?: { clientId: string; teamId: string; keyId: string; privateKey: string };
    };

    await saveAuthConfig({
      allowPassword,
      allowSignUp,
      allowPasswordReset,
      requireMfaForAdmin,
      googleOAuth,
      githubOAuth,
      appleOAuth,
    });
    setState(ADMIN_STATE.authSettings.loaded, withLoadedAt(await loadAuthSettings()));
  }) satisfies CatalogActionHandler,

  login: (async (params) => {
    const { email, password, redirectPath } = params as {
      email: string;
      password: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    const mfa = await loginWithPassword(storeSlug, email, password);
    if (mfa) {
      sessionStorage.setItem("noname_mfa_login", JSON.stringify(mfa));
      window.location.href = `/login?mfa=1&redirect=${encodeURIComponent(redirectPath ?? "/")}`;
      return;
    }
    window.location.href = redirectPath ?? "/";
  }) satisfies CatalogActionHandler,

  verifyMfa: (async (params) => {
    const { totpCode, redirectPath } = params as {
      totpCode: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    const raw = sessionStorage.getItem("noname_mfa_login");
    if (!raw) {
      throw new Error("MFA session expired — sign in again");
    }
    const state = JSON.parse(raw) as MfaLoginState;
    await verifyMfaAndLogin(storeSlug, state, totpCode);
    sessionStorage.removeItem("noname_mfa_login");
    window.location.href = redirectPath ?? "/";
  }) satisfies CatalogActionHandler,

  confirmMfaEnrollment: (async (params) => {
    const { code } = params as { code: string };
    await confirmTotpEnrollment(code);
  }) satisfies CatalogActionHandler,

  requestPasswordReset: (async (params) => {
    const { email } = params as { email: string };
    const storeSlug = requireStoreSlug();
    await requestPasswordReset(storeSlug, email);
  }) satisfies CatalogActionHandler,

  confirmPasswordReset: (async (params) => {
    const { userId, verificationCode, newPassword } = params as {
      userId: string;
      verificationCode: string;
      newPassword: string;
    };
    const storeSlug = requireStoreSlug();
    await confirmPasswordReset(storeSlug, { userId, verificationCode, newPassword });
  }) satisfies CatalogActionHandler,

  register: (async (params) => {
    const { email, password, givenName, familyName, redirectPath } = params as {
      email: string;
      password: string;
      givenName?: string;
      familyName?: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    await registerAccount(storeSlug, { email, password, givenName, familyName });
    window.location.href = redirectPath ?? "/login";
  }) satisfies CatalogActionHandler,

  idpLogin: (async (params) => {
    const { provider, redirectPath } = params as {
      provider: string;
      redirectPath?: string;
    };

    const storeSlug = requireStoreSlug();
    await startIdpLogin(storeSlug, provider, redirectPath ?? "/");
  }) satisfies CatalogActionHandler,

  logout: (async () => {
    performLogout();
  }) satisfies CatalogActionHandler,
};
