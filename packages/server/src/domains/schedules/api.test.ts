import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../release/platform-guard", () => ({
  requirePlatformOperator: vi.fn(),
}));

import { requirePlatformOperator } from "../release/platform-guard";
import { createScheduleRoutes } from "./api";
import type { ScheduleService } from "./service";

/**
 * Route behaviour for schedules.
 *
 * The interesting parts are the two boundaries: who may call these endpoints, and what the API refuses to accept. The
 * service itself is replaced, so a failure here means a route problem, not a database one.
 */
const schedule = {
  id: "0e5f3f4a-1f7f-4b1e-9a2b-111111111111",
  definition: "tenant-retention-purge",
  label: null,
  description: "Purge tenants soft-deleted longer than RETENTION_DAYS",
  pattern: "0 3 * * *",
  paused: false,
  dryRun: true,
  available: true,
  lastRun: null,
};

function app() {
  const service = {
    list: vi.fn(async () => ({ schedules: [schedule], definitions: [] })),
    create: vi.fn(async (input: { definition: string; pattern: string; actorId: string }) => ({
      ...schedule,
      definition: input.definition,
      pattern: input.pattern,
    })),
    remove: vi.fn(async () => undefined),
    setPaused: vi.fn(async () => undefined),
    setPattern: vi.fn(async () => undefined),
    setDryRun: vi.fn(async () => undefined),
    runs: vi.fn(async () => []),
    execute: vi.fn(async () => ({ items: 3, dryRun: true })),
    ensureDefaults: vi.fn(async () => 0),
  } satisfies ScheduleService;

  const routes = createScheduleRoutes(service as unknown as ScheduleService);
  const instance = new Hono();
  instance.route("/schedules", routes);
  return { instance, service };
}

beforeEach(() => {
  vi.mocked(requirePlatformOperator).mockResolvedValue({
    userId: "operator-1",
    roles: ["platform_operator"],
    permissions: [
      PERMISSIONS.PLATFORM_AUDIT_READ,
      PERMISSIONS.RELEASES_PLATFORM_WRITE,
    ],
  });
});

describe("schedules routes", () => {
  it("lists schedules and definitions together", async () => {
    const { instance } = app();
    const response = await instance.request("/schedules");
    const body = (await response.json()) as { data: { schedules: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.data.schedules).toHaveLength(1);
  });

  it("creates a schedule for an existing definition, attributing it to the caller", async () => {
    const { instance, service } = app();
    const response = await instance.request("/schedules", {
      method: "POST",
      body: JSON.stringify({ definition: "tenant-retention-purge", pattern: "0 4 * * *" }),
    });

    expect(response.status).toBe(200);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: "tenant-retention-purge",
        pattern: "0 4 * * *",
        actorId: "operator-1",
      }),
    );
  });

  it("rejects a create request without a definition or pattern", async () => {
    const { instance, service } = app();
    const response = await instance.request("/schedules", {
      method: "POST",
      body: JSON.stringify({ pattern: "0 4 * * *" }),
    });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("runs a schedule and reports what the handler returned", async () => {
    const { instance, service } = app();
    const response = await instance.request(`/schedules/${schedule.id}/run`, { method: "POST" });
    const body = (await response.json()) as { data: { items: number; dryRun: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ items: 3, dryRun: true });
    expect(service.execute).toHaveBeenCalledWith(schedule.id);
  });

  it("pauses and resumes by the same route pair", async () => {
    const { instance, service } = app();

    await instance.request(`/schedules/${schedule.id}/pause`, { method: "POST" });
    await instance.request(`/schedules/${schedule.id}/resume`, { method: "POST" });

    expect(service.setPaused).toHaveBeenNthCalledWith(1, schedule.id, true, "operator-1");
    expect(service.setPaused).toHaveBeenNthCalledWith(2, schedule.id, false, "operator-1");
  });

  it("rejects a pattern that is not a cron expression at the route level", async () => {
    const { instance, service } = app();
    const response = await instance.request(`/schedules/${schedule.id}/pattern`, {
      method: "PUT",
      body: JSON.stringify({ pattern: "" }),
    });

    expect(response.status).toBe(400);
    expect(service.setPattern).not.toHaveBeenCalled();
  });

  it("refuses a caller without platform write permission", async () => {
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      userId: "reader",
      roles: [],
      permissions: [PERMISSIONS.PLATFORM_AUDIT_READ],
    });
    const { instance, service } = app();

    const create = await instance.request("/schedules", {
      method: "POST",
      body: JSON.stringify({ definition: "tenant-retention-purge", pattern: "0 4 * * *" }),
    });
    const run = await instance.request(`/schedules/${schedule.id}/run`, { method: "POST" });

    expect(create.status).toBe(403);
    expect(run.status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.execute).not.toHaveBeenCalled();
  });
});
