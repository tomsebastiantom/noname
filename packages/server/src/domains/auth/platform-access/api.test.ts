import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../release/platform-guard", () => ({
  requirePlatformOperator: vi.fn(),
}));

import { requirePlatformOperator } from "../../release/platform-guard";
import { createPlatformAccessRoutes } from "./api";

function app() {
  const record = vi.fn(async (input: { actorType: string; actorId: string }) => ({ id: "ev-1" }));
  const routes = createPlatformAccessRoutes({
    evidence: {} as never,
    record: record as never,
    liveGrants: async () => [],
  });
  const instance = new Hono();
  instance.route("/credentials", routes);
  return { instance, record };
}

const body = {
  action: "platform.credential.granted",
  accountId: "sa-1",
  role: "platform_operator",
};

beforeEach(() => {
  vi.mocked(requirePlatformOperator).mockResolvedValue({
    userId: "provisioner-1",
    roles: ["platform_operator"],
    permissions: [PERMISSIONS.RELEASES_PLATFORM_WRITE, PERMISSIONS.PLATFORM_AUDIT_READ],
  });
});

describe("credential events route", () => {
  it("attributes a normal change to the calling operator", async () => {
    const { instance, record } = app();
    const response = await instance.request("/credentials/events", {
      method: "POST",
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "service", actorId: "provisioner-1" }),
    );
  });

  it("allows an explicit system attribution for bootstrap", async () => {
    const { instance, record } = app();
    await instance.request("/credentials/events", {
      method: "POST",
      body: JSON.stringify({ ...body, actorType: "system", reason: "bootstrap" }),
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "system", actorId: "system", reason: "bootstrap" }),
    );
  });

  it("ignores an attempt to claim a service actor", async () => {
    const { instance, record } = app();
    // The schema only accepts `system`; a `service` claim fails validation rather than impersonating an operator.
    const response = await instance.request("/credentials/events", {
      method: "POST",
      body: JSON.stringify({ ...body, actorType: "service" }),
    });

    expect(response.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects a caller without platform write permission", async () => {
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      userId: "reader",
      roles: [],
      permissions: [PERMISSIONS.PLATFORM_AUDIT_READ],
    });
    const { instance } = app();
    const response = await instance.request("/credentials/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(403);
  });
});
