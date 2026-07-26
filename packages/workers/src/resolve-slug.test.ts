import { describe, expect, it, vi } from "vitest";
import { storeSlugFromHost, resolveSiteId } from "./resolve-slug";
import type { Env } from "./types";

describe("storeSlugFromHost", () => {
  it("parses slug from subdomain host", () => {
    expect(storeSlugFromHost("yogastore.localhost:5173")).toBe("yogastore");
  });

  it("returns null for bare localhost", () => {
    expect(storeSlugFromHost("localhost:5173")).toBeNull();
  });
});

describe("resolveSiteId", () => {
  it("uses KV cache when present", async () => {
    const env = {
      API_ORIGIN: "http://localhost:3000",
      KV: {
        get: vi.fn(async () => ({ orgId: "cached-org" })),
        put: vi.fn(),
      },
    } as unknown as Env;

    const orgId = await resolveSiteId(env, "yogastore");
    expect(orgId).toBe("cached-org");
  });

  it("fetches from API on cache miss and writes KV", async () => {
    const put = vi.fn();
    const env = {
      API_ORIGIN: "http://localhost:3000",
      KV: {
        get: vi.fn(async () => null),
        put,
      },
    } as unknown as Env;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: { orgId: "org-from-api" } }),
      ),
    );

    const orgId = await resolveSiteId(env, "yogastore");
    expect(orgId).toBe("org-from-api");
    expect(put).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
