import { PERMISSIONS } from "@noname/auth";
import { describe, expect, it, vi } from "vitest";
import { createAgentRegistryService } from "./registry-service";

describe("createAgentRegistryService", () => {
  it("grants agent owner tuple on register", async () => {
    const grant = vi.fn();
    const storage = {
      create: vi.fn(async () => ({
        id: "agent-1",
        orgId: "org-1",
        slug: "landing-helper",
        label: "Landing helper",
        ownerUserId: "user-alice",
        allowedTools: [],
        createdAt: new Date(),
      })),
      list: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      delete: vi.fn(),
    };
    const registry = createAgentRegistryService({
      storage,
      authorization: {
        check: vi.fn(),
        grant,
        revoke: vi.fn(),
        listDirectUserEditors: vi.fn(),
        listDirectUserPublishers: vi.fn(),
        listRelationTuples: vi.fn(async () => []),
      },
      tokenSecret: "secret",
      resolveCreatorPermissions: vi.fn(async () => [PERMISSIONS.CONTENT_DRAFT_WRITE]),
    });

    await registry.register(
      "org-1",
      { slug: "landing-helper" },
      { userId: "user-alice", permissions: [PERMISSIONS.CONTENT_DRAFT_WRITE] },
    );

    expect(grant).toHaveBeenCalledWith({
      namespace: "Agent",
      objectId: "landing-helper",
      relation: "owners",
      subject: { type: "User", id: "user-alice" },
    });
  });

  it("defaults allowedTools to orchestrate tool ids when omitted", async () => {
    const create = vi.fn(async () => ({
      id: "agent-1",
      orgId: "org-1",
      slug: "landing-helper",
      label: "Landing helper",
      ownerUserId: "user-alice",
      allowedTools: [
        "readAnalytics",
        "readDocument",
        "listFolderDocuments",
        "nango_trigger",
        "generateLayoutDraft",
        "generateContentDraft",
        "generateMachineDraft",
      ],
      createdAt: new Date(),
    }));
    const registry = createAgentRegistryService({
      storage: {
        create,
        list: vi.fn(),
        findById: vi.fn(),
        findBySlug: vi.fn(),
        delete: vi.fn(),
      },
      authorization: {
        check: vi.fn(),
        grant: vi.fn(),
        revoke: vi.fn(),
        listDirectUserEditors: vi.fn(),
        listDirectUserPublishers: vi.fn(),
        listRelationTuples: vi.fn(async () => []),
      },
      tokenSecret: "secret",
      resolveCreatorPermissions: vi.fn(async () => [PERMISSIONS.CONTENT_DRAFT_WRITE]),
    });

    await registry.register(
      "org-1",
      { slug: "landing-helper" },
      { userId: "user-alice", permissions: [PERMISSIONS.CONTENT_DRAFT_WRITE] },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: [
          "readAnalytics",
          "readDocument",
          "listFolderDocuments",
          "nango_trigger",
          "generateLayoutDraft",
          "generateContentDraft",
          "generateMachineDraft",
          "updateDraftField",
        ],
      }),
    );
  });

  it("delegates collection editor only when creator has edit access", async () => {
    const check = vi.fn(async () => true);
    const grant = vi.fn();
    const storage = {
      create: vi.fn(),
      list: vi.fn(),
      findById: vi.fn(async () => ({
        id: "agent-1",
        orgId: "org-1",
        slug: "landing-helper",
        label: "Landing helper",
        ownerUserId: "user-alice",
        allowedTools: [],
        createdAt: new Date(),
      })),
      findBySlug: vi.fn(),
      delete: vi.fn(),
    };
    const registry = createAgentRegistryService({
      storage,
      authorization: {
        check,
        grant,
        revoke: vi.fn(),
        listDirectUserEditors: vi.fn(),
        listDirectUserPublishers: vi.fn(),
        listRelationTuples: vi.fn(async () => []),
      },
      tokenSecret: "secret",
      resolveCreatorPermissions: vi.fn(async () => [PERMISSIONS.CONTENT_DRAFT_WRITE]),
    });

    await registry.grantCollectionEditor("org-1", "agent-1", "marketing", {
      userId: "user-alice",
      userToken: "token",
      permissions: [PERMISSIONS.CONTENT_DRAFT_WRITE],
    });

    expect(check).toHaveBeenCalledWith({
      subject: { type: "User", id: "user-alice" },
      permission: "edit",
      namespace: "Collection",
      objectId: "marketing",
    });
    expect(grant).toHaveBeenCalledWith({
      namespace: "Collection",
      objectId: "marketing",
      relation: "editors",
      subject: { type: "Agent", id: "landing-helper" },
    });
  });
});
