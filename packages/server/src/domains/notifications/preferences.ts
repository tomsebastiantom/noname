import { z } from "zod";

export type CommsChannel = "email" | "sms" | "in_app";
export type NotificationCategory = "transactional" | "operational" | "marketing";

export type NotificationChannelPrefs = {
  email: boolean;
  sms: boolean;
  in_app: boolean;
};

export type NotificationCategoryPrefs = {
  marketing: boolean;
  operational: boolean;
};

export type NotificationTriggerPref = {
  enabled: boolean;
};

export type NotificationPreferences = {
  channels: NotificationChannelPrefs;
  categories: NotificationCategoryPrefs;
  triggers?: Record<string, NotificationTriggerPref>;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: { email: true, sms: false, in_app: true },
  categories: { marketing: false, operational: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (!isRecord(value)) {
    return structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  }

  const channelsRaw = isRecord(value.channels) ? value.channels : {};
  const categoriesRaw = isRecord(value.categories) ? value.categories : {};
  const triggersRaw = isRecord(value.triggers) ? value.triggers : undefined;

  const preferences: NotificationPreferences = {
    channels: {
      email: readBool(channelsRaw.email, DEFAULT_NOTIFICATION_PREFERENCES.channels.email),
      sms: readBool(channelsRaw.sms, DEFAULT_NOTIFICATION_PREFERENCES.channels.sms),
      in_app: readBool(channelsRaw.in_app, DEFAULT_NOTIFICATION_PREFERENCES.channels.in_app),
    },
    categories: {
      marketing: readBool(
        categoriesRaw.marketing,
        DEFAULT_NOTIFICATION_PREFERENCES.categories.marketing,
      ),
      operational: readBool(
        categoriesRaw.operational,
        DEFAULT_NOTIFICATION_PREFERENCES.categories.operational,
      ),
    },
  };

  if (triggersRaw) {
    const triggers: Record<string, NotificationTriggerPref> = {};
    for (const [trigger, row] of Object.entries(triggersRaw)) {
      if (!isRecord(row)) continue;
      triggers[trigger] = { enabled: readBool(row.enabled, true) };
    }
    if (Object.keys(triggers).length > 0) {
      preferences.triggers = triggers;
    }
  }

  return preferences;
}

export function mergeNotificationPreferences(
  existing: NotificationPreferences,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  return normalizeNotificationPreferences({
    channels: { ...existing.channels, ...patch.channels },
    categories: { ...existing.categories, ...patch.categories },
    triggers: patch.triggers ? { ...existing.triggers, ...patch.triggers } : existing.triggers,
  });
}

/** Transactional always delivers; otherwise channel × category × optional trigger. */
export function shouldDeliverNotification(params: {
  channel: CommsChannel;
  category: NotificationCategory;
  trigger?: string;
  preferences: NotificationPreferences;
}): boolean {
  const { channel, category, trigger, preferences } = params;

  if (category === "transactional") {
    return true;
  }

  if (trigger && preferences.triggers?.[trigger]?.enabled === false) {
    return false;
  }

  if (category === "marketing" && !preferences.categories.marketing) {
    return false;
  }
  if (category === "operational" && !preferences.categories.operational) {
    return false;
  }

  if (channel === "email" && !preferences.channels.email) return false;
  if (channel === "sms" && !preferences.channels.sms) return false;
  if (channel === "in_app" && !preferences.channels.in_app) return false;

  return true;
}

export const notificationChannelPrefsSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  in_app: z.boolean().optional(),
});

export const notificationCategoryPrefsSchema = z.object({
  marketing: z.boolean().optional(),
  operational: z.boolean().optional(),
});

export const notificationPreferencesUpdateSchema = z.object({
  channels: notificationChannelPrefsSchema.optional(),
  categories: notificationCategoryPrefsSchema.optional(),
  triggers: z.record(z.string(), z.object({ enabled: z.boolean() })).optional(),
});
