import { beforeEach, describe, expect, it, vi } from "vitest";
import { tryParseJwt } from "../auth";
import { createApiProxyRoutes } from "./proxy";
import { PUBLIC_ROUTES } from "./public-routes";

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
      {
        headers: {
          Authorization: "Bearer raw-header-token",
          "x-session-id": "7f9ecf82-e3be-4fca-a3e7-4ccae491a530",
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(tryParseJwt).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-user-id")).toBe("account-1");
    expect(headers.get("x-auth-hmac")).toBeTruthy();
    expect(headers.get("x-session-id")).toBe("7f9ecf82-e3be-4fca-a3e7-4ccae491a530");
    expect(headers.has("Authorization")).toBe(false);
    expect(target).toBe("http://origin.test/api/edge/schema/site-1?locale=fr");
  });

  it("forwards the browser session ID to authenticated render confirmation", async () => {
    const fetchMock = mockOrigin();
    vi.mocked(tryParseJwt).mockResolvedValue({
      orgId: "org-1",
      userId: "account-1",
      role: "shopper",
    });
    const app = createApiProxyRoutes();
    const response = await app.request(
      "http://store.test/api/edge/experience/rendered",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer account-token",
          "Content-Type": "application/json",
          "x-session-id": "7f9ecf82-e3be-4fca-a3e7-4ccae491a530",
        },
        body: JSON.stringify({ decisionId: "0ac94ef7-22b0-4a0d-8e5b-56c0d8a58f5c" }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("x-session-id")).toBe(
      "7f9ecf82-e3be-4fca-a3e7-4ccae491a530",
    );
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

/**
 * Audit 0.3 — regression coverage for the forged-JWT path (report 05 §7.3).
 *
 * The original chain was: a PUBLIC_ROUTES entry skipped the edge JWT check, so a
 * token whose payload *claimed* `admin` was decoded and its claims were HMAC-signed
 * into `x-user-id`/`x-role`, and the origin trusts those headers as verified identity.
 *
 * The invariant is therefore: an unverifiable credential must never be trusted.
 * Iterating `PUBLIC_ROUTES` (rather than a hand-picked list) means a newly added
 * public route is covered automatically; `samplePathFor` throws on a pattern it
 * cannot sample so an unsupported shape fails loudly instead of being skipped.
 */
describe("edge public routes never trust an unverifiable credential (audit 0.3)", () => {
  function samplePathFor(pattern: RegExp): string {
    const path = pattern.source
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .replace(/\\\//g, "/")
      .replace(/\[\^\/\]\+/g, "sample");
    if (path.includes("[") || path.includes("\\") || /[(){}|^$*+?]/.test(path)) {
      throw new Error(`cannot derive a sample path from ${String(pattern)}; extend samplePathFor`);
    }
    return path;
  }

  /** Unsigned token asserting platform roles — the exact forged shape from report 05 §7.3. */
  function forgedRoleToken(): string {
    const part = (value: unknown) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    return [
      part({ alg: "RS256", kid: "attacker", typ: "JWT" }),
      part({
        iss: "https://issuer.test",
        aud: "client-id",
        sub: "attacker",
        exp: Math.floor(Date.now() / 1000) + 3600,
        "urn:zitadel:iam:org:project:proj-1:roles": { admin: { "proj-1": "org-1" } },
        "urn:zitadel:iam:org:projects:roles": ["admin"],
      }),
      "forged-signature",
    ].join(".");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // A credential is presented, but it does not verify.
    vi.mocked(tryParseJwt).mockResolvedValue(null);
  });

  for (const { method, pattern } of PUBLIC_ROUTES) {
    const path = samplePathFor(pattern);

    it(`${method} ${path} does not sign forged role claims into identity`, async () => {
      const fetchMock = mockOrigin();
      const app = createApiProxyRoutes();
      const response = await app.request(
        `http://store.test${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${forgedRoleToken()}`,
            "content-type": "application/json",
          },
          ...(method === "POST" ? { body: "{}" } : {}),
        },
        env,
      );

      // Fail closed, or forward anonymously — never trust the claims.
      if (response.status === 401) {
        expect(fetchMock).not.toHaveBeenCalled();
        return;
      }
      expect(response.status).toBe(200);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get("x-user-id")).toBe("");
      expect(headers.get("x-role")).toBe("");
      // The raw credential may only reach the origin on the auth flows that need it.
      if (!path.startsWith("/api/auth/")) {
        expect(headers.has("Authorization")).toBe(false);
      }
    });
  }

  it("rejects the forged token outright on the credential-meaningful routes", async () => {
    for (const [method, path] of [
      ["GET", "/api/edge/schema/site-1"],
      ["POST", "/api/capabilities/commerce.checkout"],
    ] as const) {
      const fetchMock = mockOrigin();
      const app = createApiProxyRoutes();
      const response = await app.request(
        `http://store.test${path}`,
        {
          method,
          headers: { Authorization: `Bearer ${forgedRoleToken()}` },
          ...(method === "POST" ? { body: "{}" } : {}),
        },
        env,
      );
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
