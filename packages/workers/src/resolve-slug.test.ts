import { describe, expect, it, vi } from "vitest";
import { resolveSiteId, storeSlugFromHost } from "./resolve-slug";
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
      WORKER_SERVER_SECRET: "test-secret",
      KV: {
        get: vi.fn(async () => null),
        put,
      },
    } as unknown as Env;

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ data: { orgId: "org-from-api" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const orgId = await resolveSiteId(env, "yogastore");
    expect(orgId).toBe("org-from-api");
    expect(put).toHaveBeenCalled();

    // Internal edge→API calls must carry the same HMAC signature as proxy traffic.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-auth-hmac")).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("returns null without caching when the origin is unreachable", async () => {
    // Regression: this await was unguarded, so an origin outage threw out of the
    // worker and killed the wrangler dev process instead of degrading.
    const put = vi.fn();
    const env = {
      API_ORIGIN: "http://localhost:3000",
      WORKER_SERVER_SECRET: "test-secret",
      KV: {
        get: vi.fn(async () => null),
        put,
      },
    } as unknown as Env;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network connection lost");
      }),
    );

    await expect(resolveSiteId(env, "unreachable-store")).resolves.toBeNull();
    // A transient outage must not be negative-cached, or the next request would
    // serve a stale miss for the full window after the origin recovered.
    expect(put).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("does not negative-cache a 5xx from the origin", async () => {
    // Regression: any non-ok response used to be miss-cached, so a brief API
    // restart returned 400 for a valid tenant until the miss TTL expired.
    const put = vi.fn();
    const env = {
      API_ORIGIN: "http://localhost:3000",
      WORKER_SERVER_SECRET: "test-secret",
      KV: { get: vi.fn(async () => null), put },
    } as unknown as Env;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );

    await expect(resolveSiteId(env, "origin-outage-store")).resolves.toBeNull();
    expect(put).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("negative-caches a definitive 404 miss", async () => {
    const put = vi.fn();
    const env = {
      API_ORIGIN: "http://localhost:3000",
      WORKER_SERVER_SECRET: "test-secret",
      KV: { get: vi.fn(async () => null), put },
    } as unknown as Env;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );

    await expect(resolveSiteId(env, "no-such-store")).resolves.toBeNull();
    expect(put).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
