import {
  loadNotificationPreferences,
  type NotificationPreferences,
  saveNotificationPreferences,
} from "../../auth/notifications-settings";
import { isLoggedIn } from "../../auth/session";
import {
  ACCOUNT_NOTIFICATION_PREFS_STATE,
  type AccountNotificationPrefsState,
} from "../login-state";
import type { CatalogActionHandler } from "./types";

export const notificationActions = {
  loadNotificationPreferences: (async (_params, setState) => {
    setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loading, true);
    setState(ACCOUNT_NOTIFICATION_PREFS_STATE.error, null);
    if (!isLoggedIn()) {
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loaded, null);
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loading, false);
      return;
    }
    try {
      const prefs = await loadNotificationPreferences();
      const loaded: AccountNotificationPrefsState = { ...prefs, loadedAt: Date.now() };
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loaded, loaded);
    } catch (err) {
      setState(
        ACCOUNT_NOTIFICATION_PREFS_STATE.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loaded, null);
    } finally {
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveNotificationPreferences: (async (params, setState) => {
    setState(ACCOUNT_NOTIFICATION_PREFS_STATE.saving, true);
    setState(ACCOUNT_NOTIFICATION_PREFS_STATE.error, null);
    try {
      const { channels, categories } = params as {
        channels: NotificationPreferences["channels"];
        categories: NotificationPreferences["categories"];
      };
      const prefs = await saveNotificationPreferences({ channels, categories });
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.loaded, { ...prefs, loadedAt: Date.now() });
    } catch (err) {
      setState(
        ACCOUNT_NOTIFICATION_PREFS_STATE.error,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    } finally {
      setState(ACCOUNT_NOTIFICATION_PREFS_STATE.saving, false);
    }
  }) satisfies CatalogActionHandler,
};
