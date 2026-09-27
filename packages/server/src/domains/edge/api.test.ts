import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createEdgeRoutes } from "./api";
import type { EdgeService } from "./ports";

const decisionId = "0ac94ef7-22b0-4a0d-8e5b-56c0d8a58f5c";
const sessionId = "7f9ecf82-e3be-4fca-a3e7-4ccae491a530";

function createTestApp(userId: string) {
  const service = {
    getSchema: vi.fn(),
    recordExperienceRendered: vi.fn(async () => true),
  } as unknown as EdgeService;
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("userId", userId);
    await next();
  });
  app.route("/api/edge", createEdgeRoutes(service, {} as never));
  return { app, service };
}

describe("Edge experience render confirmation route", () => {
  it("requires verified account context and ignores body identity claims", async () => {
    const anonymous = createTestApp("");
    const rejected = await anonymous.app.request("/api/edge/experience/rendered", {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ decisionId, userId: "spoofed-user" }),
    });
    expect(rejected.status).toBe(401);
    expect(anonymous.service.recordExperienceRendered).not.toHaveBeenCalled();

    const authenticated = createTestApp("verified-user");
    const accepted = await authenticated.app.request("/api/edge/experience/rendered", {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ decisionId, userId: "spoofed-user" }),
    });
    expect(accepted.status).toBe(200);
    expect(authenticated.service.recordExperienceRendered).toHaveBeenCalledWith(
      "org-1",
      "verified-user",
      sessionId,
      decisionId,
    );
  });
});
