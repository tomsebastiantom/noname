import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../release/platform-guard", () => ({
  requirePlatformOperator: vi.fn(),
}));

import { requirePlatformOperator } from "../release/platform-guard";
import { createPlatformAuditRoutes } from "./platform-audit";

const event = {
  id: "audit-1",
  orgId: "org-a",
  action: "platform.release.tenant_promoted",
  actorType: "service" as const,
  actorId: "operator-1",
  subjectType: "tenant.storefront",
  subjectId: "org-a",
  recordedAt: new Date("2026-11-12T00:00:00.000Z"),
};

function app(events = [event]) {
  const listAuditAcross = vi.fn(async () => events);
  const routes = createPlatformAuditRoutes({ listAuditAcross } as never);
  const instance = new Hono();
  instance.route("/audit", routes);
  return { instance, listAuditAcross };
}

beforeEach(() => {
  vi.mocked(requirePlatformOperator).mockResolvedValue({
    userId: "operator-1",
    roles: ["platform_operator"],
    permissions: [PERMISSIONS.PLATFORM_AUDIT_READ],
  });
});

describe("platform audit", () => {
  it("returns JSON with the applied filters", async () => {
    const { instance, listAuditAcross } = app();
    const response = await instance.request("/audit?orgId=org-a&action=platform.release.tenant_promoted");

    expect(response.status).toBe(200);
    expect(listAuditAcross).toHaveBeenCalledWith({
      orgId: "org-a",
      action: "platform.release.tenant_promoted",
    });
    const body = (await response.json()) as { data: { count: number } };
    expect(body.data.count).toBe(1);
  });

  it("streams NDJSON, one event per line", async () => {
    const { instance } = app([event, { ...event, id: "audit-2", orgId: "org-b" }]);
    const response = await instance.request("/audit?format=ndjson");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text()).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({ orgId: "org-b" });
  });

  it("rejects a caller without PLATFORM_AUDIT_READ", async () => {
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      userId: "tenant-admin",
      roles: [],
      permissions: [PERMISSIONS.RELEASES_PLATFORM_READ],
    });
    const { instance } = app();
    expect((await instance.request("/audit")).status).toBe(403);
  });

  it("rejects an invalid time range", async () => {
    const { instance } = app();
    expect((await instance.request("/audit?from=not-a-date")).status).toBe(400);
  });
});
