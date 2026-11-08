import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/guards", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("../auth/adapters/zitadel/authorizations", () => ({
  listProjectAuthorizations: vi.fn(),
}));

import { listProjectAuthorizations } from "../auth/adapters/zitadel/authorizations";
import { requireAuthenticatedUser } from "../auth/guards";
import { requirePlatformOperator } from "./platform-guard";

const PLATFORM_ORG = "platform-org";
const PLATFORM_PROJECT = "platform-project";

function app(orgId: string) {
  const instance = new Hono();
  instance.use("*", async (c, next) => {
    c.set("orgId", orgId);
    await next();
  });
  instance.get("/", async (c) => {
    const operator = await requirePlatformOperator(c);
    if (operator instanceof Response) return operator;
    return c.json({ userId: operator.userId, roles: operator.roles });
  });
  return instance;
}

beforeEach(() => {
  process.env.PLATFORM_ORG_ID = PLATFORM_ORG;
  process.env.ZITADEL_PLATFORM_PROJECT_ID = PLATFORM_PROJECT;
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({
    userId: "sa-1",
    userToken: "token",
    payload: { sub: "sa-1" },
  });
  vi.mocked(listProjectAuthorizations).mockResolvedValue([
    { user: { id: "sa-1" }, roles: [{ key: "platform_operator" }] },
  ]);
});

afterEach(() => {
  delete process.env.PLATFORM_ORG_ID;
  delete process.env.ZITADEL_PLATFORM_PROJECT_ID;
  vi.clearAllMocks();
});

describe("requirePlatformOperator", () => {
  it("accepts a service account with the platform_operator role", async () => {
    const response = await app(PLATFORM_ORG).request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "sa-1", roles: ["platform_operator"] });
    expect(listProjectAuthorizations).toHaveBeenCalledWith(PLATFORM_ORG, PLATFORM_PROJECT);
  });

  it("rejects a token from another org", async () => {
    const response = await app("tenant-org").request("/");
    expect(response.status).toBe(403);
  });

  it("rejects a service account without the role", async () => {
    vi.mocked(listProjectAuthorizations).mockResolvedValue([
      { user: { id: "sa-1" }, roles: [{ key: "eval_operator" }] },
    ]);

    const response = await app(PLATFORM_ORG).request("/");
    expect(response.status).toBe(403);
  });

  it("fails closed when the platform org is not configured", async () => {
    delete process.env.PLATFORM_ORG_ID;
    const response = await app(PLATFORM_ORG).request("/");
    expect(response.status).toBe(503);
  });
});
