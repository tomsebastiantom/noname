import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceService } from "./ports";
import { createEvidenceRoutes } from "./routes";

function createTestApp(service: EvidenceService) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-test");
    c.set("userId", "user-test");
    c.set("role", "admin");
    await next();
  });
  app.route("/evidence", createEvidenceRoutes(service));
  return app;
}

function service(): EvidenceService {
  return {
    appendRecord: vi.fn(),
    appendActivity: vi.fn(),
    link: vi.fn(),
    audit: vi.fn(),
    listRecords: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    listAudit: vi.fn(async () => []),
  };
}

describe("evidence routes", () => {
  it("scopes record reads to the authenticated organization", async () => {
    const evidence = service();
    const response = await createTestApp(evidence).request(
      "/evidence/records?type=commerce.order.created&subjectId=order-1",
    );

    expect(response.status).toBe(200);
    expect(evidence.listRecords).toHaveBeenCalledWith({
      orgId: "org-test",
      type: "commerce.order.created",
      subjectType: undefined,
      subjectId: "order-1",
      limit: undefined,
    });
  });

  it("does not expose browser-facing evidence writers", async () => {
    const evidence = service();
    const response = await createTestApp(evidence).request("/evidence/records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: "attacker-org",
        type: "commerce.order.created",
        subjectType: "commerce.order",
        subjectId: "order-1",
        data: { total: 100 },
        source: "browser",
      }),
    });

    expect(response.status).toBe(404);
    expect(evidence.appendRecord).not.toHaveBeenCalled();
  });

  it("validates UUID link endpoints and list limits", async () => {
    const evidence = service();
    const app = createTestApp(evidence);
    const invalidLink = await app.request("/evidence/links/not-a-uuid");
    const invalidLimit = await app.request("/evidence/records?limit=0");

    expect(invalidLink.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
  });
});
