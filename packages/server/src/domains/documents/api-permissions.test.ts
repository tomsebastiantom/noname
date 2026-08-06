import { zitadelProjectRolesClaimKey } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orgMiddleware } from "../../shared/org";
import type { AuthorizationPort } from "../auth/authorization-port";
import { createDocumentsRoutes } from "./api";
import type { AssetBinaryStorage } from "./assets/binary";
import type { DocumentService, DocumentStorage } from "./ports";

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

const mockAssetBinary: AssetBinaryStorage = {
  put: vi.fn(async () => "https://cdn.test/asset"),
  putVariant: vi.fn(async () => "https://cdn.test/variant"),
};

function mockStorage(): DocumentStorage {
  return {
    findDocumentById: vi.fn(async (id: string) => ({
      id,
      orgId: "org-1",
      type: "layout",
      key: "home",
      version: 1,
      segment: "default",
      status: "draft" as const,
      baseVersion: null,
      data: {},
      meta: {},
      collectionId: "col-marketing",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findCollectionSlug: vi.fn(async () => "marketing"),
    listDocumentOps: vi.fn(async () => []),
  } as unknown as DocumentStorage;
}

function mockAuthorization(overrides: Partial<AuthorizationPort> = {}): AuthorizationPort {
  return {
    check: vi.fn(async () => true),
    grant: vi.fn(),
    revoke: vi.fn(),
    listDirectUserEditors: vi.fn(async () => []),
    listDirectUserPublishers: vi.fn(async () => []),
    listRelationTuples: vi.fn(async () => []),
    ...overrides,
  };
}

function testApp(authorization: AuthorizationPort) {
  const layout = {
    publish: vi.fn(async () => ({ id: "layout-1", status: "published" })),
    update: vi.fn(async () => ({ id: "layout-1", spec: {} })),
  };
  const content = {
    updateById: vi.fn(async () => ({ id: "entry-1" })),
  };
  const service = { layout, content } as unknown as DocumentService;
  const storage = mockStorage();
  const app = new Hono();
  app.use("*", orgMiddleware);
  app.route(
    "/api/documents",
    createDocumentsRoutes(service, storage, mockAssetBinary, authorization),
  );
  return { app, layout, content, authorization, storage };
}

describe("documents API permission guards", () => {
  beforeEach(() => {
    vi.stubEnv("ZITADEL_PROJECT_ID", "proj-123");
  });

  it("returns 401 on layout publish without JWT", async () => {
    const { app } = testApp(mockAuthorization());
    const res = await app.request("/api/documents/layout/layout-1/publish", {
      method: "PUT",
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when editor publishes layout", async () => {
    const { app, layout } = testApp(mockAuthorization());
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
    const { app, layout } = testApp(mockAuthorization());
    const res = await app.request("/api/documents/layout/layout-1/publish", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${adminToken()}`,
      },
    });
    expect(res.status).toBe(200);
    expect(layout.publish).toHaveBeenCalledWith("org-1", "layout-1", {
      actorId: "user-admin",
      actorType: "human",
      taskId: undefined,
    });
  });

  it("allows editor to update layout draft when Keto allows", async () => {
    const { app, layout } = testApp(mockAuthorization());
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

  it("returns 403 when Keto denies document edit", async () => {
    const authorization = mockAuthorization({ check: vi.fn(async () => false) });
    const { app, layout } = testApp(authorization);
    const res = await app.request("/api/documents/layout/layout-1", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${editorToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: { root: "main", elements: {} } }),
    });
    expect(res.status).toBe(403);
    expect(layout.update).not.toHaveBeenCalled();
    expect(authorization.check).toHaveBeenCalledWith({
      subject: { type: "User", id: "user-editor" },
      permission: "edit",
      namespace: "Collection",
      objectId: "marketing",
    });
  });

  it("returns 403 when Keto denies content edit", async () => {
    const authorization = mockAuthorization({ check: vi.fn(async () => false) });
    const { app, content } = testApp(authorization);
    const res = await app.request("/api/documents/product/entry-1", {
      method: "PUT",
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${editorToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Updated", collectionId: "col-marketing" }),
    });
    expect(res.status).toBe(403);
    expect(content.updateById).not.toHaveBeenCalled();
  });

  it("lists document ops when editor has document access", async () => {
    const ops = [
      {
        id: "op-1",
        orgId: "org-1",
        documentId: "layout-1",
        serverVersion: 1,
        operation: "update",
        actorType: "human",
        actorId: "user-editor",
        onBehalfOf: null,
        taskId: null,
        clientId: null,
        clientSeq: null,
        payload: { opType: "patch_data", patch: [] },
        createdAt: new Date("2026-08-06T12:00:00.000Z"),
      },
    ];
    const storage = mockStorage();
    vi.mocked(storage.listDocumentOps).mockResolvedValue(ops);
    const layout = {
      publish: vi.fn(async () => ({ id: "layout-1", status: "published" })),
      update: vi.fn(async () => ({ id: "layout-1", spec: {} })),
    };
    const service = { layout, content: { updateById: vi.fn() } } as unknown as DocumentService;
    const app = new Hono();
    app.use("*", orgMiddleware);
    app.route(
      "/api/documents",
      createDocumentsRoutes(service, storage, mockAssetBinary, mockAuthorization()),
    );

    const res = await app.request("/api/documents/document/layout-1/ops?from_version=1", {
      headers: {
        "x-org-id": "org-1",
        Authorization: `Bearer ${editorToken()}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { documentId: string; ops: unknown[] } };
    expect(body.data.documentId).toBe("layout-1");
    expect(body.data.ops).toHaveLength(1);
    expect(storage.listDocumentOps).toHaveBeenCalledWith({
      orgId: "org-1",
      documentId: "layout-1",
      fromVersion: 1,
      limit: 50,
    });
  });
});
