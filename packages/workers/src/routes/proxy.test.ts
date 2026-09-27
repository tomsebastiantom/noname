import { beforeEach, describe, expect, it, vi } from "vitest";
import { tryParseJwt } from "../auth";
import { createApiProxyRoutes } from "./proxy";

vi.mock("../auth", () => ({
  tryParseJwt: vi.fn(),
  validateJwt: vi.fn(),
}));
vi.mock("./resolve-proxy-org", () => ({
  resolveProxyOrgId: vi.fn(async () => "org-1"),
}));

const env = {
  API_ORIGIN: "http://origin.test",
  WORKER_SERVER_SECRET: "worker-secret",
  ZITADEL_ISSUER: "https://issuer.test",
  ZITADEL_CLIENT_ID: "client-id",
} as never;

function mockOrigin() {
  const fetchMock = vi.fn(async (..._args: [RequestInfo | URL, RequestInit?]) =>
    Response.json({ data: { ok: true } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("API proxy optional authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tryParseJwt).mockResolvedValue(null);
  });

  it("keeps storefront schema anonymously available with an empty signed identity", async () => {
    const fetchMock = mockOrigin();
    const app = createApiProxyRoutes();
    const response = await app.request("http://store.test/api/edge/schema/site-1", {}, env);

    expect(response.status).toBe(200);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-org-id")).toBe("org-1");
    expect(headers.get("x-user-id")).toBe("");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("validates optional JWT and HMAC-signs its identity without forwarding the token", async () => {
    const fetchMock = mockOrigin();
    vi.mocked(tryParseJwt).mockResolvedValue({
      orgId: "org-1",
      userId: "account-1",
      role: "shopper",
    });
    const app = createApiProxyRoutes();
    const response = await app.request(
      "http://store.test/api/edge/schema/site-1?access_token=raw-query-token&locale=fr",
      { headers: { Authorization: "Bearer raw-header-token" } },
      env,
    );

    expect(response.status).toBe(200);
    expect(tryParseJwt).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-user-id")).toBe("account-1");
    expect(headers.get("x-auth-hmac")).toBeTruthy();
    expect(headers.has("Authorization")).toBe(false);
    expect(target).toBe("http://origin.test/api/edge/schema/site-1?locale=fr");
  });

  it("carries optional verified identity for signed-in capability checkout", async () => {
    const fetchMock = mockOrigin();
    vi.mocked(tryParseJwt).mockResolvedValue({
      orgId: "org-1",
      userId: "account-1",
      role: "shopper",
    });
    const app = createApiProxyRoutes();
    const response = await app.request(
      "http://store.test/api/capabilities/commerce.checkout",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer checkout-token",
          "Idempotency-Key": "checkout-1",
        },
        body: JSON.stringify({ input: { instanceId: "cart-1" } }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-user-id")).toBe("account-1");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("fails closed when an optional credential is supplied but invalid", async () => {
    const fetchMock = mockOrigin();
    const app = createApiProxyRoutes();
    const response = await app.request(
      "http://store.test/api/edge/schema/site-1",
      { headers: { Authorization: "Bearer invalid-token" } },
      env,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves anonymous publishable-key capability calls", async () => {
    const fetchMock = mockOrigin();
    const app = createApiProxyRoutes();
    const response = await app.request(
      "http://store.test/api/capabilities/commerce.checkout",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-publishable-key": "public-key",
        },
        body: JSON.stringify({ input: {} }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-publishable-key")).toBe("public-key");
    expect(headers.get("x-user-id")).toBe("");
    expect(headers.has("Authorization")).toBe(false);
  });
});
