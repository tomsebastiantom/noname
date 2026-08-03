import { describe, expect, it, vi } from "vitest";
import { contentCollections, contentTeams } from "../../documents/schema";
import { createScopeService } from "./service";

function mockDbList(rows: { id?: string; slug: string; label: string }[]) {
  const rowData = rows.map((r) => ({
    ...r,
    id: r.id ?? "col-1",
    orgId: "org-1",
  }));
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => rowData),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}

function mockDbMutate(rows: { id?: string; slug: string; label: string }[]) {
  const rowData = rows.map((r) => ({
    ...r,
    id: r.id ?? "col-1",
    orgId: "org-1",
  }));
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (rowData.length > 0 ? [rowData[0]] : [])),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}

const emptyTupleReader = {
  listDirectUserEditors: vi.fn(async () => []),
  listDirectUserPublishers: vi.fn(async () => []),
  listRelationTuples: vi.fn(async () => []),
};

const allowEditorRole = vi.fn(async () => "editor" as const);
const allowPublisherRole = vi.fn(async () => "publisher" as const);

function baseScopeDeps(overrides: Record<string, unknown> = {}) {
  return {
    db: mockDbMutate([]) as never,
    storage: { listDocuments: vi.fn() } as never,
    tupleWriter: { grant: vi.fn(), revoke: vi.fn() },
    tupleReader: emptyTupleReader,
    resolveUserStaffRole: allowEditorRole,
    ...overrides,
  };
}

describe("createScopeService", () => {
  it("lists teams from catalog", async () => {
    const scope = createScopeService({
      ...baseScopeDeps({
        db: mockDbList([
          { slug: "marketing", label: "Marketing" },
          { slug: "landing", label: "Landing" },
        ]),
      }),
    });
    await expect(scope.listTeams("org-1")).resolves.toEqual([
      { slug: "landing", label: "Landing" },
      { slug: "marketing", label: "Marketing" },
    ]);
  });

  it("grants team editor tuple", async () => {
    const grant = vi.fn();
    const scope = createScopeService({
      ...baseScopeDeps({
        db: mockDbMutate([{ slug: "marketing", label: "Marketing" }]),
        tupleWriter: { grant, revoke: vi.fn() },
      }),
    });
    await scope.grantTeamEditor("org-1", "marketing-team", "user-1");
    expect(grant).toHaveBeenCalledWith({
      namespace: "Team",
      objectId: "marketing-team",
      relation: "editors",
      subject: { type: "User", id: "user-1" },
    });
  });

  it("rejects editor on publisher slot", async () => {
    const scope = createScopeService(baseScopeDeps());
    await expect(scope.grantTeamPublisher("org-1", "marketing-team", "user-1")).rejects.toThrow(
      /cannot join team publishers slot/,
    );
  });

  it("grants collection parent tuple when parentId is set", async () => {
    const grant = vi.fn();
    const parentId = "parent-id";
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: parentId, slug: "marketing", orgId: "org-1" }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => undefined),
        })),
      })),
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    };
    const scope = createScopeService({
      ...baseScopeDeps({
        db: db as never,
        tupleWriter: { grant, revoke: vi.fn() },
      }),
    });
    await scope.createCollection("org-1", "summer-campaign", "Summer campaign", parentId);
    expect(grant).toHaveBeenCalledWith({
      namespace: "Collection",
      objectId: "summer-campaign",
      relation: "parents",
      subject: { type: "Collection", id: "marketing" },
    });
  });

  it("rejects delete when folder has subfolders", async () => {
    const select = vi.fn();
    select
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: "marketing-id", slug: "marketing", orgId: "org-1" }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ id: "child-id" }]),
        })),
      });
    const db = {
      select,
      insert: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };
    const scope = createScopeService({
      ...baseScopeDeps({ db: db as never }),
    });
    await expect(scope.deleteCollection("org-1", "marketing")).rejects.toThrow(/subfolders/);
  });

  it("deletes collection from postgres and revokes keto tuples", async () => {
    const revoke = vi.fn();
    const listRelationTuples = vi.fn(async () => [
      {
        namespace: "Collection" as const,
        objectId: "marketing",
        relation: "editors",
        subject: { type: "Team" as const, id: "marketing-team", relation: "editors" },
      },
    ]);
    const db = mockDbMutate([{ slug: "marketing", label: "Marketing" }]);
    const scope = createScopeService({
      ...baseScopeDeps({
        db,
        tupleWriter: { grant: vi.fn(), revoke },
        tupleReader: { ...emptyTupleReader, listRelationTuples },
      }),
    });
    await scope.deleteCollection("org-1", "marketing");
    expect(listRelationTuples).toHaveBeenCalledWith({
      namespace: "Collection",
      objectId: "marketing",
    });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalled();
  });

  it("unbinds collection team editors", async () => {
    const revoke = vi.fn();
    const scope = createScopeService({
      ...baseScopeDeps({
        db: mockDbMutate([{ slug: "marketing", label: "Marketing" }]),
        tupleWriter: { grant: vi.fn(), revoke },
      }),
    });
    await scope.unbindCollectionTeamEditors("org-1", "marketing", "marketing-team");
    expect(revoke).toHaveBeenCalledWith({
      namespace: "Collection",
      objectId: "marketing",
      relation: "editors",
      subject: { type: "Team", id: "marketing-team", relation: "editors" },
    });
  });

  it("lists collection team bindings from keto tuples", async () => {
    const listRelationTuples = vi.fn(async (filter: { objectId?: string }) => {
      if (filter.objectId === "marketing") {
        return [
          {
            namespace: "Collection" as const,
            objectId: "marketing",
            relation: "editors",
            subject: { type: "Team" as const, id: "marketing-team", relation: "editors" },
          },
          {
            namespace: "Collection" as const,
            objectId: "marketing",
            relation: "publishers",
            subject: { type: "Team" as const, id: "marketing-team", relation: "publishers" },
          },
        ];
      }
      return [];
    });
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(async () => {
            if (table === contentCollections) {
              return [{ slug: "marketing", label: "Marketing", orgId: "org-1" }];
            }
            if (table === contentTeams) {
              return [{ slug: "marketing-team", label: "Marketing team", orgId: "org-1" }];
            }
            return [];
          }),
        })),
      })),
    };
    const scope = createScopeService({
      ...baseScopeDeps({
        db: db as never,
        tupleReader: { ...emptyTupleReader, listRelationTuples },
      }),
    });
    await expect(scope.listCollectionTeamBindings("org-1")).resolves.toEqual([
      {
        collection: "marketing",
        team: "marketing-team",
        editors: true,
        publishers: true,
      },
    ]);
  });

  it("lists team members with editor and publisher slots", async () => {
    const listDirectUserEditors = vi.fn(async () => [{ type: "User" as const, id: "user-1" }]);
    const listDirectUserPublishers = vi.fn(async () => [{ type: "User" as const, id: "user-2" }]);
    const scope = createScopeService({
      ...baseScopeDeps({
        db: mockDbMutate([{ slug: "marketing-team", label: "Marketing team" }]),
        tupleReader: {
          ...emptyTupleReader,
          listDirectUserEditors,
          listDirectUserPublishers,
        },
      }),
    });
    await expect(scope.listTeamMembers("org-1", "marketing-team")).resolves.toEqual([
      { userId: "user-1", editors: true, publishers: false },
      { userId: "user-2", editors: false, publishers: true },
    ]);
  });

  it("grants direct document editor tuple", async () => {
    const grant = vi.fn();
    const doc = { id: "doc-1", orgId: "org-1", collectionId: null };
    const scope = createScopeService({
      ...baseScopeDeps({
        storage: { findDocumentById: vi.fn(async () => doc) } as never,
        tupleWriter: { grant, revoke: vi.fn() },
      }),
    });
    await scope.grantDocumentEditor("org-1", "doc-1", "user-bob");
    expect(grant).toHaveBeenCalledWith({
      namespace: "Document",
      objectId: "doc-1",
      relation: "editors",
      subject: { type: "User", id: "user-bob" },
    });
  });

  it("grants direct document publisher tuple when role is publisher", async () => {
    const grant = vi.fn();
    const doc = { id: "doc-1", orgId: "org-1", collectionId: null };
    const scope = createScopeService({
      ...baseScopeDeps({
        storage: { findDocumentById: vi.fn(async () => doc) } as never,
        tupleWriter: { grant, revoke: vi.fn() },
        resolveUserStaffRole: allowPublisherRole,
      }),
    });
    await scope.grantDocumentPublisher("org-1", "doc-1", "user-bob");
    expect(grant).toHaveBeenCalledWith({
      namespace: "Document",
      objectId: "doc-1",
      relation: "publishers",
      subject: { type: "User", id: "user-bob" },
    });
  });
});
