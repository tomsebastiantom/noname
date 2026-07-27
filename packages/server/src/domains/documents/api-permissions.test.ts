import { zitadelProjectRolesClaimKey } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orgMiddleware } from "../../shared/org";
import { createDocumentsRoutes } from "./api";
import type { DocumentService } from "./ports";

vi.mock("../auth/adapters/zitadel/project-id", () => ({
  zitadelProjectIdOrNull: vi.fn(() => "proj-123"),
}));

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.sig`;
}

function editorToken(): string {
  return jwt({
    sub: "user-editor",
    [zitadelProjectRolesClaimKey("proj-123")]: { editor: {} },
  });
}

function adminToken(): string {
  return jwt({
    sub: "user-admin",
    [zitadelProjectRolesClaimKey("proj-123")]: { admin: {} },
  });
}

function testApp() {
  const layout = {
    publish: vi.fn(async () => ({ id: "layout-1", status: "published" })),
    update: vi.fn(async () => ({ id: "layout-1", spec: {} })),
  };
  const service = { layout } as unknown as DocumentService;
  const app = new Hono();
  app.use("*", orgMiddleware);
  app.route("/api/documents", createDocumentsRoutes(service));
  return { app, layout };
}

describe("documents API permission guards", () => {
  beforeEach(() => {
    vi.stubEnv("ZITADEL_PROJECT_ID", "proj-123");
  });

  it("returns 401 on layout publish without JWT", async () => {
    const { app } = testApp();
    const res = await app.request("/api/documents/layout/layout-1/publish", {
      method: "PUT",
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when editor publishes layout", async () => {
    const { app, layout } = testApp();
    const res = await app.request("/api/documents/layout/layout-1/publish", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${editorToken()}`,
      },
    });
    expect(res.status).toBe(403);
    expect(layout.publish).not.toHaveBeenCalled();
  });

  it("allows admin to publish layout", async () => {
    const { app, layout } = testApp();
    const res = await app.request("/api/documents/layout/layout-1/publish", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${adminToken()}`,
      },
    });
    expect(res.status).toBe(200);
    expect(layout.publish).toHaveBeenCalledWith("org-1", "layout-1");
  });

  it("allows editor to update layout draft", async () => {
    const { app, layout } = testApp();
    const res = await app.request("/api/documents/layout/layout-1", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${editorToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: { root: "main", elements: {} } }),
    });
    expect(res.status).toBe(200);
    expect(layout.update).toHaveBeenCalled();
  });
});
