import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
  shouldDeliverNotification,
} from "./preferences";

describe("shouldDeliverNotification", () => {
  it("always delivers transactional messages", () => {
    expect(
      shouldDeliverNotification({
        channel: "email",
        category: "transactional",
        preferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          channels: { email: false, sms: false, in_app: false },
          categories: { marketing: false, operational: false },
        },
      }),
    ).toBe(true);
  });

  it("respects marketing category and email channel", () => {
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      categories: { marketing: false, operational: true },
    };
    expect(
      shouldDeliverNotification({
        channel: "email",
        category: "marketing",
        preferences,
      }),
    ).toBe(false);
    expect(
      shouldDeliverNotification({
        channel: "email",
        category: "marketing",
        preferences: mergeNotificationPreferences(preferences, {
          categories: { marketing: true },
        }),
      }),
    ).toBe(true);
  });

  it("respects operational category on in_app channel", () => {
    expect(
      shouldDeliverNotification({
        channel: "in_app",
        category: "operational",
        preferences: mergeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
          categories: { operational: false },
        }),
      }),
    ).toBe(false);
  });

  it("respects per-trigger disable", () => {
    expect(
      shouldDeliverNotification({
        channel: "email",
        category: "operational",
        trigger: "agent-task-complete",
        preferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          triggers: { "agent-task-complete": { enabled: false } },
        },
      }),
    ).toBe(false);
  });
});

describe("normalizeNotificationPreferences", () => {
  it("returns defaults for invalid input", () => {
    expect(normalizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("merges partial channel and category patches", () => {
    const merged = mergeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      channels: { sms: true },
      categories: { marketing: true },
    });
    expect(merged.channels.sms).toBe(true);
    expect(merged.categories.marketing).toBe(true);
    expect(merged.channels.email).toBe(true);
  });
});
