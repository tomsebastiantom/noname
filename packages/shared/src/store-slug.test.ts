import { describe, expect, it } from "vitest";
import { assertValidStoreSlug, normalizeStoreSlug, storeSlugFromHost } from "./store-slug";

describe("normalizeStoreSlug", () => {
  it("trims and lowercases", () => {
    expect(normalizeStoreSlug("  YogaStore  ")).toBe("yogastore");
  });
});

describe("assertValidStoreSlug", () => {
  it("accepts valid slugs", () => {
    expect(() => assertValidStoreSlug("yoga-store-1")).not.toThrow();
  });

  it("rejects reserved slugs", () => {
    expect(() => assertValidStoreSlug("admin")).toThrow(/reserved/i);
  });

  it("rejects invalid characters", () => {
    expect(() => assertValidStoreSlug("bad_slug")).toThrow(/lowercase/i);
  });
});

describe("storeSlugFromHost", () => {
  it("parses slug from subdomain host", () => {
    expect(storeSlugFromHost("yogastore.localhost:5173")).toBe("yogastore");
  });

  it("returns null for bare localhost", () => {
    expect(storeSlugFromHost("localhost:5173")).toBeNull();
  });
});
