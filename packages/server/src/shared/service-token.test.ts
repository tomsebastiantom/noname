import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireActorPermission } from "../domains/auth/guards";
import { signServiceToken, verifyServiceToken } from "./service-token";

const SECRET = "test-service-token-secret";
const ORG = "org-1";

const claims = (overrides: Partial<Parameters<typeof signServiceToken>[0]> = {}) => ({
  serviceId: "eval",
  orgId: ORG,
  permissions: [PERMISSIONS.MACHINES_READ],
  exp: Math.floor(Date.now() / 1000) + 60,
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("SERVICE_TOKEN_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function probeApp(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", ORG);
    await next();
  });
  app.get("/read", async (c) => {
    const actor = await requireActorPermission(c, PERMISSIONS.MACHINES_READ);
    if (actor instanceof Response) return actor;
    return c.json({ ok: true, type: actor.type });
  });
  app.post("/write", async (c) => {
    const denied = await requireActorPermission(c, PERMISSIONS.MACHINES_DEFINE);
    if (denied instanceof Response) return denied;
    return c.json({ ok: true });
  });
  return app;
}

describe("service tokens", () => {
  it("round-trips claims", () => {
    const token = signServiceToken(claims());
    expect(verifyServiceToken(token)).toMatchObject({
      serviceId: "eval",
      orgId: ORG,
      permissions: [PERMISSIONS.MACHINES_READ],
    });
  });

  it("rejects a tampered payload", () => {
    const token = signServiceToken(claims());
    const [prefix, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims(), permissions: [PERMISSIONS.MACHINES_DEFINE] }),
    ).toString("base64url");
    expect(verifyServiceToken(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signServiceToken(claims({ exp: Math.floor(Date.now() / 1000) - 1 }));
    expect(verifyServiceToken(token)).toBeNull();
  });

  it("rejects an unknown permission rather than silently dropping it", () => {
    const token = signServiceToken(
      claims({ permissions: ["machines:read", "not:a-permission"] as never }),
    );
    expect(verifyServiceToken(token)).toBeNull();
  });

  it("rejects everything when no secret is configured", () => {
    vi.stubEnv("SERVICE_TOKEN_SECRET", "");
    vi.stubEnv("WORKER_SERVER_SECRET", "");
    const token = signServiceToken(claims(), "explicit-secret");
    expect(verifyServiceToken(token)).toBeNull();
  });
});

describe("machine actor at the permission guard", () => {
  it("allows the permission it holds", async () => {
    const token = signServiceToken(claims());
    const response = await probeApp().request("http://api.test/read", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, type: "machine" });
  });

  it("denies a write permission the token does not hold", async () => {
    const token = signServiceToken(claims());
    const response = await probeApp().request("http://api.test/write", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });

  it("rejects a token minted for another org", async () => {
    const token = signServiceToken(claims({ orgId: "org-2" }));
    const response = await probeApp().request("http://api.test/read", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});
