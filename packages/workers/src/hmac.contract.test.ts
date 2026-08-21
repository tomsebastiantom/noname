import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { getOrgId, getRole, getUserId, orgMiddleware } from "../../server/src/shared/org";
import { tenantMiddleware } from "../../server/src/shared/tenant";
import { hmacHeaders } from "./hmac";

/**
 * Contract test: edge worker signing (packages/workers/src/hmac.ts) must stay
 * byte-compatible with server verification (packages/server/src/shared/{org,tenant}.ts).
 * If either side changes payload format, algorithm, encoding, or header names,
 * this test fails.
 */

const SECRET = "contract-test-secret";
const ORG = "org_123";
const USER = "user_abc";
const ROLE = "admin";

beforeEach(() => {
  process.env.WORKER_SERVER_SECRET = SECRET;
  delete process.env.REQUIRE_EDGE_HMAC;
});

function buildOrgApp() {
  const app = new Hono();
  app.use("*", orgMiddleware);
  app.get("/ping", (c) => c.json({ orgId: getOrgId(c), userId: getUserId(c), role: getRole(c) }));
  return app;
}

function buildTenantApp() {
  const app = new Hono();
  app.use("*", tenantMiddleware);
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("worker sign -> server verify (org middleware)", () => {
  it("accepts a signature produced by hmacHeaders", async () => {
    const headers = await hmacHeaders(ORG, USER, ROLE, {
      WORKER_SERVER_SECRET: SECRET,
    } as never);
    const res = await buildOrgApp().request("/ping", { headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: ORG, userId: USER, role: ROLE });
  });

  it("rejects a tampered signature", async () => {
    const headers = await hmacHeaders(ORG, USER, ROLE, {
      WORKER_SERVER_SECRET: SECRET,
    } as never);
    headers["x-auth-hmac"] = `${headers["x-auth-hmac"].slice(0, -2)}AA`;
    const res = await buildOrgApp().request("/ping", { headers });
    expect(res.status).toBe(401);
  });

  it("rejects a signature signed with a different secret", async () => {
    const headers = await hmacHeaders(ORG, USER, ROLE, {
      WORKER_SERVER_SECRET: "other-secret",
    } as never);
    const res = await buildOrgApp().request("/ping", { headers });
    expect(res.status).toBe(401);
  });

  it("rejects requests without a signature (edge-only enforcement)", async () => {
    const res = await buildOrgApp().request("/ping", {
      headers: { "x-org-id": ORG },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a signature whose payload was modified (header/splice attack)", async () => {
    const headers = await hmacHeaders(ORG, "", "", {
      WORKER_SERVER_SECRET: SECRET,
    } as never);
    headers["x-user-id"] = USER;
    const res = await buildOrgApp().request("/ping", { headers });
    expect(res.status).toBe(401);
  });
});

describe("worker sign -> server verify (tenant middleware)", () => {
  it("accepts the same signature format against tenant routes", async () => {
    const headers = await hmacHeaders(ORG, USER, ROLE, {
      WORKER_SERVER_SECRET: SECRET,
    } as never);
    headers["x-tenant-id"] = headers["x-org-id"];
    delete headers["x-org-id"];
    const res = await buildTenantApp().request("/ping", { headers });
    expect(res.status).toBe(200);
  });

  it("rejects a tampered tenant signature", async () => {
    const headers = await hmacHeaders(ORG, USER, ROLE, {
      WORKER_SERVER_SECRET: SECRET,
    } as never);
    headers["x-tenant-id"] = headers["x-org-id"];
    delete headers["x-org-id"];
    headers["x-role"] = "superadmin";
    const res = await buildTenantApp().request("/ping", { headers });
    expect(res.status).toBe(401);
  });
});
