import { describe, expect, it, vi } from "vitest";
import type { AuthorizationPort } from "../../../auth/authorization-port";
import { documentRow } from "../../../documents/test-helpers";
import type { AgentRunContext } from "../context";
import { createListFolderDocumentsTool } from "./list-folder-documents";
import { createReadDocumentTool } from "./read-document";
import { createUpdateDraftFieldTool } from "./update-draft-field";

const runContext: AgentRunContext = {
  orgId: "org-1",
  taskId: "task-1",
  registeredAgentId: "agent-1",
  agentSlug: "demo-agent",
  onBehalfOf: "user-1",
};

function mockAuth(allowed = true): AuthorizationPort {
  return {
    check: vi.fn(async () => allowed),
    grant: vi.fn(),
    revoke: vi.fn(),
    listDirectUserEditors: vi.fn(async () => []),
    listDirectUserPublishers: vi.fn(async () => []),
    listRelationTuples: vi.fn(async () => []),
  };
}

describe("createReadDocumentTool", () => {
  it("returns document payload when agent has Keto view access", async () => {
    const doc = {
      ...documentRow("doc-1", "page"),
      data: { title: "About us" },
    };
    const tool = createReadDocumentTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => doc),
          findCollectionSlug: vi.fn(async () => "marketing"),
        },
        authorization: mockAuth(true),
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.({ documentId: "doc-1" }, {} as never);
    expect(result).toMatchObject({
      found: true,
      document: expect.objectContaining({
        id: "doc-1",
        title: "About us",
      }),
    });
  });

  it("returns forbidden when Keto denies view", async () => {
    const tool = createReadDocumentTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => documentRow("doc-1", "page")),
          findCollectionSlug: vi.fn(async () => null),
        },
        authorization: mockAuth(false),
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.({ documentId: "doc-1" }, {} as never);
    expect(result).toEqual({ allowed: false, reason: "forbidden", documentId: "doc-1" });
  });

  it("returns found=false for other org documents", async () => {
    const tool = createReadDocumentTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => ({
            ...documentRow("doc-1", "page", "org-other"),
          })),
          findCollectionSlug: vi.fn(async () => null),
        },
        authorization: mockAuth(true),
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.({ documentId: "doc-1" }, {} as never);
    expect(result).toEqual({ found: false, documentId: "doc-1" });
  });
});

describe("createListFolderDocumentsTool", () => {
  it("lists documents when agent can view folder", async () => {
    const rows = [
      { ...documentRow("doc-1", "page"), collectionId: "col-1", data: { title: "Home" } },
      { ...documentRow("doc-2", "page"), collectionId: "col-1" },
    ];
    const tool = createListFolderDocumentsTool(
      {
        storage: {
          findCollectionIdBySlug: vi.fn(async () => "col-1"),
          listDocuments: vi.fn(async (_orgId, filters) =>
            rows.filter((row) => row.collectionId === filters?.collectionId),
          ),
        },
        authorization: mockAuth(true),
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.({ folderSlug: "marketing" }, {} as never);
    expect(result).toMatchObject({
      found: true,
      folderSlug: "marketing",
      collectionId: "col-1",
      count: 2,
    });
  });

  it("returns forbidden when agent lacks folder access", async () => {
    const tool = createListFolderDocumentsTool(
      {
        storage: {
          findCollectionIdBySlug: vi.fn(async () => "col-1"),
          listDocuments: vi.fn(async () => []),
        },
        authorization: mockAuth(false),
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.({ folderSlug: "marketing" }, {} as never);
    expect(result).toEqual({ allowed: false, reason: "forbidden", folderSlug: "marketing" });
  });
});

describe("createUpdateDraftFieldTool", () => {
  it("patches a draft field when agent has edit access", async () => {
    const doc = {
      ...documentRow("doc-1", "page"),
      status: "draft" as const,
      collectionId: "col-1",
    };
    const updateById = vi.fn(async () => ({
      ...doc,
      data: { title: "New title" },
    }));
    const artifacts = { push: vi.fn(), list: vi.fn(() => []) };
    const tool = createUpdateDraftFieldTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => doc),
          findCollectionSlug: vi.fn(async () => "marketing"),
        },
        content: { updateById },
        authorization: mockAuth(true),
        artifacts,
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.(
      {
        documentId: "doc-1",
        contentType: "page",
        fieldKey: "title",
        value: "New title",
      },
      {} as never,
    );

    expect(result).toMatchObject({
      updated: true,
      contentId: "doc-1",
      fieldKey: "title",
    });
    expect(updateById).toHaveBeenCalledWith(
      "org-1",
      "page",
      "doc-1",
      { title: "New title" },
      expect.objectContaining({ audit: expect.any(Object) }),
    );
    expect(artifacts.push).toHaveBeenCalled();
  });

  it("rejects published documents", async () => {
    const tool = createUpdateDraftFieldTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => ({
            ...documentRow("doc-1", "page"),
            status: "published" as const,
          })),
          findCollectionSlug: vi.fn(async () => null),
        },
        content: { updateById: vi.fn() },
        authorization: mockAuth(true),
        artifacts: { push: vi.fn(), list: vi.fn(() => []) },
        runContext,
      },
      "org-1",
    );

    const result = await tool.execute?.(
      {
        documentId: "doc-1",
        contentType: "page",
        fieldKey: "title",
        value: "Nope",
      },
      {} as never,
    );

    expect(result).toMatchObject({ updated: false, reason: "not_draft", status: "published" });
  });
});
