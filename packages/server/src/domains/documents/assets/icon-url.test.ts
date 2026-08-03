import { describe, expect, it } from "vitest";
import type { AssetDTO } from "../ports";
import { iconUrlFromAsset } from "./icon-url";

function asset(data: Record<string, unknown>): AssetDTO {
  return {
    id: "asset-1",
    orgId: "org-1",
    type: "asset",
    key: "asset-1",
    version: 1,
    segment: "default",
    status: "published",
    baseVersion: null,
    meta: {},
    collectionId: null,
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("iconUrlFromAsset", () => {
  it("prefers storageKey with public base URL", () => {
    expect(iconUrlFromAsset(asset({ storageKey: "org-1/hash/icon.svg" }))).toBe(
      "https://assets.noname.dev/org-1/hash/icon.svg",
    );
  });

  it("falls back to original.url", () => {
    expect(iconUrlFromAsset(asset({ original: { url: "https://cdn.example/icon.svg" } }))).toBe(
      "https://cdn.example/icon.svg",
    );
  });

  it("returns null when asset is missing or has no URL fields", () => {
    expect(iconUrlFromAsset(null)).toBeNull();
    expect(iconUrlFromAsset(asset({}))).toBeNull();
  });
});
