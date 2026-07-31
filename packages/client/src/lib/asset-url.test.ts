import { describe, expect, it } from "vitest";
import { assetUrlFromData, urlFromStorageKey } from "./asset-url";

describe("assetUrlFromData", () => {
  it("prefers storageKey over stale original.url", () => {
    expect(
      assetUrlFromData({
        storageKey: "org-1/hash/icon.svg",
        original: { url: "https://assets.noname.dev/stale/icon.svg" },
      }),
    ).toBe("https://assets.noname.dev/org-1/hash/icon.svg");
  });

  it("falls back to original.url when storageKey is missing", () => {
    expect(assetUrlFromData({ original: { url: "https://cdn.example/icon.png" } })).toBe(
      "https://cdn.example/icon.png",
    );
  });

  it("falls back to variants.original.url", () => {
    expect(
      assetUrlFromData({
        variants: { original: { url: "https://cdn.example/variant.png" } },
      }),
    ).toBe("https://cdn.example/variant.png");
  });

  it("returns null when no url source exists", () => {
    expect(assetUrlFromData({})).toBeNull();
  });
});

describe("urlFromStorageKey", () => {
  it("joins default base and key", () => {
    expect(urlFromStorageKey("org/a.png")).toBe("https://assets.noname.dev/org/a.png");
  });
});
