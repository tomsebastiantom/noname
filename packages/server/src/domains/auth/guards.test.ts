import { PERMISSIONS, zitadelProjectRolesClaimKey } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePermission } from "./guards";
import { installTestJwks, signTestToken } from "./testing/test-tokens";

vi.mock("./adapters/zitadel/project-id", () => ({
  zitadelProjectIdOrNull: vi.fn(() => "proj-123"),
}));

function appWithGuard() {
  const app = new Hono();
  app.get("/protected", async (c) => {
    const auth = await requirePermission(c, PERMISSIONS.AUTH_MANAGE);
    if (auth instanceof Response) return auth;
    return c.json({ ok: true, userId: auth.userId });
  });
  return app;
}

describe("requirePermission", () => {
  beforeEach(() => {
    installTestJwks();
    vi.stubEnv("ZITADEL_PROJECT_ID", "proj-123");
  });

  it("returns 401 without bearer token", async () => {
    const res = await appWithGuard().request("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 403 when JWT lacks auth:manage", async () => {
    const token = signTestToken({
      sub: "user-1",
      [zitadelProjectRolesClaimKey("proj-123")]: { editor: {} },
    });
    const res = await appWithGuard().request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("allows admin JWT with auth:manage", async () => {
    const token = signTestToken({
      sub: "user-admin",
      [zitadelProjectRolesClaimKey("proj-123")]: { admin: {} },
    });
    const res = await appWithGuard().request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("user-admin");
  });

  it("rejects a token with a fabricated signature", async () => {
    const body = Buffer.from(
      JSON.stringify({
        sub: "attacker",
        iss: "https://issuer.test",
        aud: "test-client",
        exp: Math.floor(Date.now() / 1000) + 3600,
        [zitadelProjectRolesClaimKey("proj-123")]: { admin: {} },
      }),
    ).toString("base64url");
    const res = await appWithGuard().request("/protected", {
      headers: { Authorization: `Bearer header.${body}.sig` },
    });
    expect(res.status).toBe(401);
  });
});
