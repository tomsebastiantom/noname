import {
  confirmPasswordReset,
  confirmTotpEnrollment,
  loginWithPassword,
  type MfaLoginState,
  registerAccount,
  requestPasswordReset,
  verifyMfaAndLogin,
} from "../../auth/account-flows";
import { saveAuthConfig } from "../../auth/auth-settings";
import { startIdpLogin } from "../../auth/idp-login";
import { performLogout } from "../../auth/logout";
import { requireStoreSlug } from "../../auth/org";
import type { CatalogActionHandler } from "./types";

export const authActions = {
  saveAuthConfig: (async (params) => {
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
