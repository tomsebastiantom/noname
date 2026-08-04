import { describe, expect, it } from "vitest";
import { mergeOAuthConnections, readOAuthConnectionMap } from "./oauth-connections";

describe("oauth-connections", () => {
  it("readOAuthConnectionMap prefers stored map and merges legacy fields", () => {
    const map = readOAuthConnectionMap({
      nango: { slack: { connectionId: "conn-slack" } },
      stripe: { connectionId: "conn-stripe" },
    } as never);

    expect(map).toEqual({
      slack: { connectionId: "conn-slack" },
      stripe: { connectionId: "conn-stripe" },
    });
  });

  it("mergeOAuthConnections uses catalog metadata and marks connected rows", () => {
    const rows = mergeOAuthConnections(
      [
        { integrationId: "stripe", displayName: "Stripe", provider: "stripe" },
        { integrationId: "hubspot", displayName: "HubSpot", provider: "hubspot" },
      ],
      { stripe: { connectionId: "conn-1" } },
    );

    expect(rows).toEqual([
      { integrationId: "hubspot", displayName: "HubSpot", provider: "hubspot", connected: false },
      {
        integrationId: "stripe",
        displayName: "Stripe",
        provider: "stripe",
        connected: true,
        connectionId: "conn-1",
      },
    ]);
  });
});
