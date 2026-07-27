import { describe, expect, it } from "vitest";
import {
  shouldStripBodyOrg,
  stripOrgFromPublicJsonBody,
  stripOrgFromSearch,
} from "./strip-public-org";

describe("strip-public-org", () => {
  it("strips orgId from analytics ingest bodies", () => {
    expect(shouldStripBodyOrg("/api/analytics/track", "POST")).toBe(true);
    const out = stripOrgFromPublicJsonBody(
      "/api/analytics/track",
      JSON.stringify({ orgId: "spoof", events: [{ eventType: "page_view" }] }),
    );
    expect(JSON.parse(out)).toEqual({ events: [{ eventType: "page_view" }] });
  });

  it("leaves batch track arrays unchanged", () => {
    const body = JSON.stringify([{ eventType: "page_view", sessionId: "s1" }]);
    expect(stripOrgFromPublicJsonBody("/api/analytics/track", body)).toBe(body);
  });

  it("strips context.orgId from flags evaluate", () => {
    const out = stripOrgFromPublicJsonBody(
      "/api/flags/evaluate",
      JSON.stringify({
        context: { orgId: "spoof", contextHash: "abc", contextProperties: {} },
      }),
    );
    expect(JSON.parse(out)).toEqual({
      context: { contextHash: "abc", contextProperties: {} },
    });
  });

  it("strips orgId from flags stream query", () => {
    expect(stripOrgFromSearch("/api/flags/stream", "?orgId=spoof&foo=1")).toBe("?foo=1");
  });
});
