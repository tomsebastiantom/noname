import { describe, expect, it, vi } from "vitest";
import { resolveSiteIdToOrgId } from "./site-id";

describe("resolveSiteIdToOrgId", () => {
  it("resolves store slug to org id", async () => {
    const tenantSettings = {
      resolveStoreSlug: vi.fn(async (slug: string) => (slug === "yogastore" ? "org-123" : null)),
      get: vi.fn(),
      upsert: vi.fn(),
    };
    await expect(resolveSiteIdToOrgId(tenantSettings, "yogastore")).resolves.toBe("org-123");
  });

  it("returns null for unknown slug", async () => {
    const tenantSettings = {
      resolveStoreSlug: vi.fn(async () => null),
      get: vi.fn(),
      upsert: vi.fn(),
    };
    await expect(resolveSiteIdToOrgId(tenantSettings, "unknown-shop")).resolves.toBeNull();
  });
});
