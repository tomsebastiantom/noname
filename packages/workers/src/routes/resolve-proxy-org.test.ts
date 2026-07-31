import { describe, expect, it, vi } from "vitest";
import * as slug from "../resolve-slug";
import { resolveProxyOrgId } from "./resolve-proxy-org";

describe("resolveProxyOrgId", () => {
  const env = {} as Parameters<typeof resolveProxyOrgId>[0];

  it("prefers path slug over JWT org", async () => {
    vi.spyOn(slug, "resolveSiteId").mockResolvedValue("tenant-from-path");
    const orgId = await resolveProxyOrgId(
      env,
      "/api/auth/yogastore/config",
      "yogastore.localhost:5173",
      "zitadel-org-wrong",
      undefined,
    );
    expect(orgId).toBe("tenant-from-path");
    vi.restoreAllMocks();
  });

  it("prefers Host slug over JWT org for slug-less routes", async () => {
    vi.spyOn(slug, "resolveSiteId").mockResolvedValue(null);
    vi.spyOn(slug, "resolveOrgIdFromHost").mockResolvedValue("tenant-from-host");
    const orgId = await resolveProxyOrgId(
      env,
      "/api/documents/content-types",
      "yogastore.localhost:5173",
      "zitadel-org-wrong",
      undefined,
    );
    expect(orgId).toBe("tenant-from-host");
    vi.restoreAllMocks();
  });

  it("falls back to JWT org when host/path missing", async () => {
    vi.spyOn(slug, "resolveSiteId").mockResolvedValue(null);
    vi.spyOn(slug, "resolveOrgIdFromHost").mockResolvedValue(null);
    const orgId = await resolveProxyOrgId(
      env,
      "/api/documents/content-types",
      "localhost:5173",
      "jwt-org-id",
      undefined,
    );
    expect(orgId).toBe("jwt-org-id");
    vi.restoreAllMocks();
  });
});
