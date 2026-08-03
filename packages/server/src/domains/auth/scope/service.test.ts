import { describe, expect, it, vi } from "vitest";
import { createScopeService } from "./service";

function mockDbList(rows: { slug: string; label: string }[]) {
  const rowData = rows.map((r) => ({ ...r, orgId: "org-1" }));
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => rowData),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
}

function mockDbMutate(rows: { slug: string; label: string }[]) {
  const rowData = rows.map((r) => ({ ...r, orgId: "org-1" }));
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

  it("deletes tag from postgres and revokes keto tuples", async () => {
    const revoke = vi.fn();
    const listRelationTuples = vi.fn(async () => [
      {
        namespace: "Tag" as const,
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
    await scope.deleteTag("org-1", "marketing");
    expect(listRelationTuples).toHaveBeenCalledWith({ namespace: "Tag", objectId: "marketing" });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalled();
  });

  it("unbinds tag team editors", async () => {
    const revoke = vi.fn();
    const scope = createScopeService({
      ...baseScopeDeps({
        db: mockDbMutate([{ slug: "marketing", label: "Marketing" }]),
        tupleWriter: { grant: vi.fn(), revoke },
      }),
    });
    await scope.unbindTagTeamEditors("org-1", "marketing", "marketing-team");
    expect(revoke).toHaveBeenCalledWith({
      namespace: "Tag",
      objectId: "marketing",
      relation: "editors",
      subject: { type: "Team", id: "marketing-team", relation: "editors" },
    });
  });

  it("grants direct document editor tuple", async () => {
    const grant = vi.fn();
    const doc = { id: "doc-1", orgId: "org-1", tags: [] };
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
    const doc = { id: "doc-1", orgId: "org-1", tags: [] };
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
