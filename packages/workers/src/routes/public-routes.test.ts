import { describe, expect, it } from "vitest";
import { isPublicGet, isPublicPost } from "./public-routes";

describe("edge public routes", () => {
  it("allows anonymous analytics ingest POST", () => {
    expect(isPublicPost("POST", "/api/analytics/track")).toBe(true);
    expect(isPublicPost("POST", "/api/analytics/error")).toBe(true);
    expect(isPublicPost("POST", "/api/analytics/replay")).toBe(true);
  });

  it("allows anonymous flags evaluate and stream", () => {
    expect(isPublicPost("POST", "/api/flags/evaluate")).toBe(true);
    expect(isPublicGet("GET", "/api/flags/stream")).toBe(true);
  });

  it("still requires JWT for analytics reads", () => {
    expect(isPublicGet("GET", "/api/analytics/events")).toBe(false);
    expect(isPublicPost("POST", "/api/analytics/segment-events")).toBe(false);
  });

  it("allows edge schema GET without JWT", () => {
    expect(isPublicGet("GET", "/api/edge/schema/yogastore")).toBe(true);
  });

  it("allows comms provider webhooks POST without JWT", () => {
    for (const provider of ["resend", "ses", "sendgrid", "mailgun", "postmark", "brevo", "twilio"]) {
      expect(isPublicPost("POST", `/api/notifications/webhooks/${provider}`)).toBe(true);
    }
  });
});
