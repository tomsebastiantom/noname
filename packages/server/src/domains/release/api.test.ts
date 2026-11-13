import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/guards", () => ({
  requireAuthenticatedUser: vi.fn(),
  requireActorPermission: vi.fn(),
  requirePermission: vi.fn(),
  requireHumanPermission: vi.fn(),
}));

vi.mock("../auth/deny-unless", () => ({
  denyUnless: vi.fn(async () => undefined),
}));

vi.mock("../auth/adapters/zitadel/authorizations", () => ({
  listProjectAuthorizations: vi.fn(async () => []),
}));

vi.mock("./platform-guard", () => ({
  requirePlatformOperator: vi.fn(),
}));

vi.mock("./migration-policy", () => ({
  assertMigrationsPromotable: vi.fn(),
}));

import { requirePlatformOperator } from "./platform-guard";
import { createReleaseRoutes } from "./api";

const PLATFORM_ORG = "platform-org";
const RELEASE = {
  id: "rel-1",
  orgId: PLATFORM_ORG,
  state: "ready",
  checksVersion: "c1",
  platformVersion: "1.0.0",
};

function app(overrides: { promote?: ReturnType<typeof vi.fn> } = {}) {
  const promote = overrides.promote ?? vi.fn(async () => ({ releaseId: "rel-1" }));
  const routes = createReleaseRoutes(
    { getAnyOrg: async () => RELEASE } as never,
    {} as never,
    {} as never,
    {
      get: async () => null,
      promote,
    } as never,
    {} as never,
    {
      selectability: async () => ({ selectable: true }),
      verdict: async () => ({ status: "pass" }),
    },
  );
  const instance = new Hono();
  instance.route("/releases", routes);
  return { instance, promote };
}

const approval = {
  userId: "operator-1",
  roles: ["platform_operator"],
  permissions: [PERMISSIONS.RELEASES_PLATFORM_WRITE, PERMISSIONS.RELEASES_PLATFORM_READ],
};

beforeEach(() => {
  process.env.PLATFORM_ORG_ID = PLATFORM_ORG;
  vi.mocked(requirePlatformOperator).mockResolvedValue(approval);
});

describe("wave rollout", () => {
  it("dry-run writes nothing", async () => {
    const { instance, promote } = app();
    const response = await instance.request("/releases/rel-1/rollout", {
      method: "POST",
      body: JSON.stringify({ orgIds: ["org-a"], dryRun: true }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { results: Array<{ status: string }> } };
    expect(body.data.results[0]?.status).toBe("eligible");
    expect(promote).not.toHaveBeenCalled();
  });

  it("writes the pointer for each eligible org", async () => {
    const { instance, promote } = app();
    const response = await instance.request("/releases/rel-1/rollout", {
      method: "POST",
      body: JSON.stringify({ orgIds: ["org-a", "org-b"], dryRun: false }),
    });

    expect(response.status).toBe(200);
    expect(promote).toHaveBeenCalledTimes(2);
    expect(promote).toHaveBeenCalledWith("org-a", "rel-1", "operator-1", {
      platformOrgId: PLATFORM_ORG,
      actorType: "service",
    });
    const body = (await response.json()) as {
      data: { summary: { promoted: number }; results: Array<{ status: string }> };
    };
    expect(body.data.summary.promoted).toBe(2);
  });

  it("continues after one org fails and reports it", async () => {
    const promote = vi
      .fn()
      .mockRejectedValueOnce(new Error("pointer write failed"))
      .mockResolvedValueOnce({ releaseId: "rel-1" });
    const { instance } = app({ promote });

    const response = await instance.request("/releases/rel-1/rollout", {
      method: "POST",
      body: JSON.stringify({ orgIds: ["org-a", "org-b"], dryRun: false }),
    });

    const body = (await response.json()) as {
      data: {
        summary: { promoted: number; failed: number };
        results: Array<{ orgId: string; status: string; error?: string }>;
      };
    };
    expect(body.data.summary).toMatchObject({ promoted: 1, failed: 1 });
    expect(body.data.results[0]).toMatchObject({
      orgId: "org-a",
      status: "failed",
      error: "pointer write failed",
    });
    expect(body.data.results[1]).toMatchObject({ orgId: "org-b", status: "promoted" });
  });
});
