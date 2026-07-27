import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePermission } from "./guards";
import { PERMISSIONS } from "./permissions";
import { zitadelProjectRolesClaimKey } from "./roles-from-jwt";

vi.mock("./zitadel-project-id", () => ({
  zitadelProjectIdOrNull: vi.fn(() => "proj-123"),
}));

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.sig`;
}

function appWithGuard() {
  const app = new Hono();
  app.get("/protected", (c) => {
    const auth = requirePermission(c, PERMISSIONS.AUTH_MANAGE);
    if (auth instanceof Response) return auth;
    return c.json({ ok: true, userId: auth.userId });
  });
  return app;
}

describe("requirePermission", () => {
  beforeEach(() => {
    vi.stubEnv("ZITADEL_PROJECT_ID", "proj-123");
  });

  it("returns 401 without bearer token", async () => {
    const res = await appWithGuard().request("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 403 when JWT lacks auth:manage", async () => {
    const token = jwt({
      sub: "user-1",
      [zitadelProjectRolesClaimKey("proj-123")]: { editor: {} },
    });
    const res = await appWithGuard().request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("allows admin JWT with auth:manage", async () => {
    const token = jwt({
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
});
