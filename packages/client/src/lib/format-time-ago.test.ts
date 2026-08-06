import { describe, expect, it } from "vitest";
import { formatTimeAgo } from "./format-time-ago";

describe("formatTimeAgo", () => {
  it("formats minutes in the past", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    const label = formatTimeAgo("2026-08-06T11:58:00.000Z", now, "en");
    expect(label).toMatch(/2 minutes ago|2 min/);
  });
});
