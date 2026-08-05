import type { NotificationPreferences } from "../auth/notifications-settings";

/** json-render $state paths for public login surface. */
export const LOGIN_STATE = {
  authConfig: "/login/auth-config",
} as const;

export type LoginAuthConfigState = {
  loadedAt: number;
  providers: string[];
  allowPassword: boolean;
  allowSignUp: boolean;
  allowPasswordReset: boolean;
  providerLabels: Record<string, string>;
  providerIcons: Record<string, string>;
};

/** json-render $state paths for /account/security. */
export const ACCOUNT_SECURITY_STATE = {
  session: "/account/security/session",
  loading: "/account/security/loading",
} as const;

export type AccountSecuritySessionState = {
  loadedAt: number;
  mfaEnrolled: boolean;
};

/** json-render $state paths for /account/communication-preferences. */
export const ACCOUNT_NOTIFICATION_PREFS_STATE = {
  loaded: "/account/notification-prefs/loaded",
  loading: "/account/notification-prefs/loading",
  saving: "/account/notification-prefs/saving",
  error: "/account/notification-prefs/error",
} as const;

export type AccountNotificationPrefsState = NotificationPreferences & {
  loadedAt: number;
};
