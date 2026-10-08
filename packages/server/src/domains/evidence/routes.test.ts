import { PERMISSIONS, type PermissionKey } from "@noname/auth";
import { type Context, Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceService } from "./ports";
import { createEvidenceRoutes, type EvidenceRouteOptions } from "./routes";

vi.mock("../auth/guards", () => ({
  requirePermission: vi.fn(async (context: Context, permission: PermissionKey) => {
    if (context.req.header("x-order-view") === "allowed") {
      return { userId: "user-test", userToken: "token", permissions: [permission] };
    }
    return context.json({ error: "Forbidden" }, 403);
  }),
}));

function createTestApp(service: EvidenceService, options?: EvidenceRouteOptions) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-test");
    c.set("userId", "user-test");
    c.set("role", "admin");
    await next();
  });
  app.route("/evidence", createEvidenceRoutes(service, options));
  return app;
}

function service(): EvidenceService {
  return {
    appendRecord: vi.fn(),
    appendActivity: vi.fn(),
    link: vi.fn(),
    audit: vi.fn(),
    listRecords: vi.fn(async () => []),
    findRecord: vi.fn(async () => null),
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

  it("filters protected Commerce records from broad generic Evidence reads", async () => {
    const evidence = service();
    vi.mocked(evidence.listRecords).mockResolvedValue([
      {
        id: "order-record",
        orgId: "org-test",
        type: "commerce.order.created",
        subjectType: "commerce.order",
        subjectId: "order-1",
        data: { ownerUserId: "private-owner", totalMinor: 5000 },
        source: "commerce",
        recordedAt: new Date(),
      },
      {
        id: "note-record",
        orgId: "org-test",
        type: "note.created",
        subjectType: "note",
        subjectId: "note-1",
        data: { title: "Public evidence" },
        source: "notes",
        recordedAt: new Date(),
      },
    ]);
    const app = createTestApp(evidence, {
      permissionsByRecordType: { "commerce.order.created": PERMISSIONS.COMMERCE_ORDERS_VIEW },
      permissionsBySubjectType: { "commerce.order": PERMISSIONS.COMMERCE_ORDERS_VIEW },
    });

    const response = await app.request("/evidence/records");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [{ id: "note-record", subjectType: "note" }],
    });
  });

  it("requires Commerce view permission for direct Evidence and link reads", async () => {
    const evidence = service();
    vi.mocked(evidence.findRecord).mockResolvedValue({
      id: "order-record",
      orgId: "org-test",
      type: "commerce.order.created",
      subjectType: "commerce.order",
      subjectId: "order-1",
      data: { totalMinor: 5000 },
      source: "commerce",
      recordedAt: new Date(),
    });
    const app = createTestApp(evidence, {
      permissionsByRecordType: { "commerce.order.created": PERMISSIONS.COMMERCE_ORDERS_VIEW },
      permissionsBySubjectType: { "commerce.order": PERMISSIONS.COMMERCE_ORDERS_VIEW },
    });

    const recordResponse = await app.request("/evidence/records?type=commerce.order.created");
    const linkResponse = await app.request("/evidence/links/00000000-0000-4000-8000-000000000001");
    expect(recordResponse.status).toBe(403);
    expect(linkResponse.status).toBe(403);
    expect(evidence.listLinks).not.toHaveBeenCalled();
  });

  it("does not reveal protected order endpoints through public Evidence links", async () => {
    const evidence = service();
    vi.mocked(evidence.findRecord).mockImplementation(async (_orgId, id) => {
      if (id === "public-record") {
        return {
          id,
          orgId: "org-test",
          type: "note.created",
          subjectType: "note",
          subjectId: "note-1",
          data: {},
          source: "notes",
          recordedAt: new Date(),
        };
      }
      if (id === "order-record") {
        return {
          id,
          orgId: "org-test",
          type: "commerce.order.created",
          subjectType: "commerce.order",
          subjectId: "order-1",
          data: { totalMinor: 5000 },
          source: "commerce",
          recordedAt: new Date(),
        };
      }
      return null;
    });
    vi.mocked(evidence.listLinks).mockResolvedValue([
      {
        id: "link-1",
        orgId: "org-test",
        fromId: "public-record",
        toId: "order-record",
        relation: "references",
        createdAt: new Date(),
      },
    ]);
    const app = createTestApp(evidence, {
      permissionsByRecordType: { "commerce.order.created": PERMISSIONS.COMMERCE_ORDERS_VIEW },
      permissionsBySubjectType: { "commerce.order": PERMISSIONS.COMMERCE_ORDERS_VIEW },
    });

    const response = await app.request("/evidence/links/00000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [] });
  });

  it("allows authorized users to retrieve protected Commerce Evidence", async () => {
    const evidence = service();
    vi.mocked(evidence.listRecords).mockResolvedValue([
      {
        id: "order-record",
        orgId: "org-test",
        type: "commerce.order.created",
        subjectType: "commerce.order",
        subjectId: "order-1",
        data: { totalMinor: 5000 },
        source: "commerce",
        recordedAt: new Date(),
      },
    ]);
    const app = createTestApp(evidence, {
      permissionsByRecordType: { "commerce.order.created": PERMISSIONS.COMMERCE_ORDERS_VIEW },
      permissionsBySubjectType: { "commerce.order": PERMISSIONS.COMMERCE_ORDERS_VIEW },
    });

    const response = await app.request("/evidence/records?type=commerce.order.created", {
      headers: { "x-order-view": "allowed" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [{ id: "order-record" }] });
  });
});
