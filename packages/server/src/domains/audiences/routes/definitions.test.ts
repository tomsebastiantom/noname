import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudienceDefinitionRoutes } from "./definitions";

const { denyUnlessMock } = vi.hoisted(() => ({ denyUnlessMock: vi.fn() }));
vi.mock("../../auth/deny-unless", () => ({ denyUnless: denyUnlessMock }));

function app() {
  const service = { activityTypes: { list: () => [] } } as unknown as Parameters<
    typeof createAudienceDefinitionRoutes
  >[0];
  const routes = new Hono();
  routes.route("/api/audiences", createAudienceDefinitionRoutes(service));
  return routes;
}

describe("audience tenant management route permissions", () => {
  beforeEach(() => denyUnlessMock.mockReset());
  it("requires TENANT_MANAGE to read registered activity metadata", async () => {
    denyUnlessMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    const response = await app().request("/api/audiences/activity-types");
    expect(response.status).toBe(403);
    expect(denyUnlessMock).toHaveBeenCalledOnce();
    expect(denyUnlessMock.mock.calls[0]?.[1]).toBe(PERMISSIONS.TENANT_MANAGE);
  });
  it("does not expose a public activity ingestion endpoint", async () => {
    const response = await app().request("/api/audiences/activities", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(404);
    expect(denyUnlessMock).not.toHaveBeenCalled();
  });
});
