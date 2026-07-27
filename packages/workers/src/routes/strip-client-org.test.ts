import { describe, expect, it } from "vitest";
import {
  shouldStripClientOrg,
  stripClientOrgFromJsonBody,
  stripClientOrgFromUrl,
} from "./strip-client-org";

describe("strip-client-org", () => {
  it("matches analytics and flags routes", () => {
    expect(shouldStripClientOrg("POST", "/api/analytics/track")).toBe(true);
    expect(shouldStripClientOrg("POST", "/api/flags/evaluate")).toBe(true);
    expect(shouldStripClientOrg("GET", "/api/flags/stream")).toBe(true);
    expect(shouldStripClientOrg("GET", "/api/analytics/events")).toBe(false);
  });

  it("strips top-level orgId from analytics body", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        orgId: "spoofed",
        events: [{ eventType: "page_view", sessionId: "s1" }],
      }),
    ).buffer;
    const out = stripClientOrgFromJsonBody(raw, "/api/analytics/track");
    expect(out).not.toBeNull();
    const json = JSON.parse(new TextDecoder().decode(out!)) as Record<string, unknown>;
    expect(json.orgId).toBeUndefined();
    expect(json.events).toHaveLength(1);
  });

  it("leaves batch array bodies unchanged", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify([{ eventType: "page_view", sessionId: "s1" }]),
    ).buffer;
    expect(stripClientOrgFromJsonBody(raw, "/api/analytics/track")).toBeNull();
  });

  it("strips context.orgId from flags evaluate", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        context: { orgId: "spoofed", contextHash: "abc", schemaId: null, variantId: null },
        flagKeys: ["x"],
      }),
    ).buffer;
    const out = stripClientOrgFromJsonBody(raw, "/api/flags/evaluate");
    const json = JSON.parse(new TextDecoder().decode(out!)) as {
      context: Record<string, unknown>;
    };
    expect(json.context.orgId).toBeUndefined();
    expect(json.context.contextHash).toBe("abc");
  });

  it("removes orgId query param from stream URL", () => {
    expect(stripClientOrgFromUrl("http://api:3000/api/flags/stream?orgId=1&foo=bar")).toBe(
      "http://api:3000/api/flags/stream?foo=bar",
    );
  });
});
