import { canJoinTeamEditorSlot, canJoinTeamPublisherSlot, type StaffRole } from "@noname/auth";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import type { DocumentStorage } from "../../documents/ports";
import { contentCollections, contentTeams, documents } from "../../documents/schema";
import { normalizeCollectionSlug } from "../../documents/shared/document-collection";
import type { AuthorizationPort, AuthSubject, RelationTuple } from "../authorization-port";

async function revokeTuples(
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  tuples: RelationTuple[],
): Promise<void> {
  for (const tuple of tuples) {
    await tupleWriter.revoke(tuple);
  }
}

async function revokeAllCollectionTuples(
  tupleReader: Pick<AuthorizationPort, "listRelationTuples">,
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  collectionSlug: string,
): Promise<void> {
  const tuples = await tupleReader.listRelationTuples({
    namespace: "Collection",
    objectId: collectionSlug,
  });
  await revokeTuples(tupleWriter, tuples);
}

async function revokeAllTeamTuples(
  tupleReader: Pick<AuthorizationPort, "listRelationTuples">,
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  teamSlug: string,
): Promise<void> {
  for (const relation of ["editors", "publishers"] as const) {
    const members = await tupleReader.listRelationTuples({
      namespace: "Team",
      objectId: teamSlug,
      relation,
    });
    await revokeTuples(tupleWriter, members);

    const collectionBindings = await tupleReader.listRelationTuples({
      namespace: "Collection",
      subjectSet: { namespace: "Team", object: teamSlug, relation },
    });
    await revokeTuples(tupleWriter, collectionBindings);
  }
}

async function requireDocumentInOrg(
  storage: DocumentStorage,
  orgId: string,
  documentId: string,
): Promise<void> {
  const doc = await storage.findDocumentById(documentId);
  if (!doc || doc.orgId !== orgId) {
    throw new NotFoundError("Document", documentId);
  }
}

function slugOrThrow(raw: string, label: string): string {
  const slug = normalizeCollectionSlug(raw);
  if (!slug) throw new ValidationError(label, "Invalid slug");
  return slug;
}

export interface CollectionTeamBinding {
  collection: string;
  team: string;
  editors: boolean;
  publishers: boolean;
}

export interface TeamMemberEntry {
  userId: string;
  editors: boolean;
  publishers: boolean;
}

export function createScopeService(deps: {
  db: Database;
  storage: DocumentStorage;
  tupleWriter: Pick<AuthorizationPort, "grant" | "revoke">;
  tupleReader: Pick<
    AuthorizationPort,
    "listDirectUserEditors" | "listDirectUserPublishers" | "listRelationTuples"
  >;
  resolveUserStaffRole: (orgId: string, userId: string) => Promise<StaffRole | null>;
}) {
  return {
    async listCollections(
      orgId: string,
    ): Promise<{ id: string; slug: string; label: string; parentId: string | null }[]> {
      const rows = await deps.db
        .select()
        .from(contentCollections)
        .where(eq(contentCollections.orgId, orgId));
      return rows
        .map((r) => ({
          id: r.id,
          slug: r.slug,
          label: r.label,
          parentId: r.parentId ?? null,
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async createCollection(
      orgId: string,
      slug: string,
      label: string,
      parentId?: string | null,
    ): Promise<void> {
      const normalized = slugOrThrow(slug, "slug");
      const trimmedLabel = label.trim() || normalized;
      let parentSlug: string | null = null;
      if (parentId) {
        parentSlug = await resolveParentSlug(deps.db, orgId, parentId);
      }
      await deps.db
        .insert(contentCollections)
        .values({
          orgId,
          slug: normalized,
          label: trimmedLabel,
          parentId: parentId ?? null,
        })
        .onConflictDoUpdate({
          target: [contentCollections.orgId, contentCollections.slug],
          set: { label: trimmedLabel },
        });
      if (parentSlug) {
        await deps.tupleWriter.grant({
          namespace: "Collection",
          objectId: normalized,
          relation: "parents",
          subject: { type: "Collection", id: parentSlug },
        });
      }
    },

    async deleteCollection(orgId: string, slug: string): Promise<void> {
      const collectionSlug = slugOrThrow(slug, "collection");
      const row = await ensureCollectionExists(deps.db, orgId, collectionSlug);
      const childRows = await deps.db
        .select({ id: contentCollections.id })
        .from(contentCollections)
        .where(and(eq(contentCollections.orgId, orgId), eq(contentCollections.parentId, row.id)));
      if (childRows.length > 0) {
        throw new ValidationError("slug", "Folder has subfolders; delete or move them first");
      }
      await revokeAllCollectionTuples(deps.tupleReader, deps.tupleWriter, collectionSlug);
      await deps.db
        .update(documents)
        .set({ collectionId: null })
        .where(eq(documents.collectionId, row.id));
      await deps.db
        .delete(contentCollections)
        .where(
          and(eq(contentCollections.orgId, orgId), eq(contentCollections.slug, collectionSlug)),
        );
    },

    async listTeams(orgId: string): Promise<{ slug: string; label: string }[]> {
      const rows = await deps.db.select().from(contentTeams).where(eq(contentTeams.orgId, orgId));
      return rows
        .map((r) => ({ slug: r.slug, label: r.label }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async listCollectionTeamBindings(orgId: string): Promise<CollectionTeamBinding[]> {
      const [collections, teams] = await Promise.all([
        deps.db.select().from(contentCollections).where(eq(contentCollections.orgId, orgId)),
        deps.db.select().from(contentTeams).where(eq(contentTeams.orgId, orgId)),
      ]);
      const teamSlugs = new Set(teams.map((row) => row.slug));
      const bindingMap = new Map<string, CollectionTeamBinding>();

      for (const collection of collections) {
        const tuples = await deps.tupleReader.listRelationTuples({
          namespace: "Collection",
          objectId: collection.slug,
        });
        for (const tuple of tuples) {
          if (tuple.subject.type !== "Team" || !teamSlugs.has(tuple.subject.id)) continue;
          const key = `${collection.slug}\0${tuple.subject.id}`;
          let binding = bindingMap.get(key);
          if (!binding) {
            binding = {
              collection: collection.slug,
              team: tuple.subject.id,
              editors: false,
              publishers: false,
            };
            bindingMap.set(key, binding);
          }
          if (tuple.relation === "editors") binding.editors = true;
          if (tuple.relation === "publishers") binding.publishers = true;
        }
      }

      return [...bindingMap.values()].sort((a, b) => {
        const byCollection = a.collection.localeCompare(b.collection);
        if (byCollection !== 0) return byCollection;
        return a.team.localeCompare(b.team);
      });
    },

    async createTeam(orgId: string, slug: string, label: string): Promise<void> {
      const normalized = slugOrThrow(slug, "slug");
      const trimmedLabel = label.trim() || normalized;
      await deps.db
        .insert(contentTeams)
        .values({
          orgId,
          slug: normalized,
          label: trimmedLabel,
        })
        .onConflictDoUpdate({
          target: [contentTeams.orgId, contentTeams.slug],
          set: { label: trimmedLabel },
        });
    },

    async deleteTeam(orgId: string, slug: string): Promise<void> {
      const teamSlug = slugOrThrow(slug, "team");
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await revokeAllTeamTuples(deps.tupleReader, deps.tupleWriter, teamSlug);
      await deps.db
        .delete(contentTeams)
        .where(and(eq(contentTeams.orgId, orgId), eq(contentTeams.slug, teamSlug)));
    },

    async bindCollectionTeamEditors(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async bindCollectionTeamPublishers(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "publishers",
        subject: { type: "Team", id: teamSlug, relation: "publishers" },
      });
    },

    async unbindCollectionTeamEditors(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async unbindCollectionTeamPublishers(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "publishers",
        subject: { type: "Team", id: teamSlug, relation: "publishers" },
      });
    },

    async grantTeamEditor(orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "editors");
      await deps.tupleWriter.grant({
        namespace: "Team",
        objectId: teamSlug,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async revokeTeamEditor(_orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await deps.tupleWriter.revoke({
        namespace: "Team",
        objectId: teamSlug,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async grantTeamPublisher(orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "publishers");
      await deps.tupleWriter.grant({
        namespace: "Team",
        objectId: teamSlug,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async revokeTeamPublisher(_orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await deps.tupleWriter.revoke({
        namespace: "Team",
        objectId: teamSlug,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async listTeamMembers(orgId: string, team: string): Promise<TeamMemberEntry[]> {
      const teamSlug = slugOrThrow(team, "team");
      await ensureTeamExists(deps.db, orgId, teamSlug);
      const [editorUsers, publisherUsers] = await Promise.all([
        deps.tupleReader.listDirectUserEditors("Team", teamSlug),
        deps.tupleReader.listDirectUserPublishers("Team", teamSlug),
      ]);
      const memberMap = new Map<string, TeamMemberEntry>();
      for (const user of editorUsers) {
        let entry = memberMap.get(user.id);
        if (!entry) {
          entry = { userId: user.id, editors: false, publishers: false };
          memberMap.set(user.id, entry);
        }
        entry.editors = true;
      }
      for (const user of publisherUsers) {
        let entry = memberMap.get(user.id);
        if (!entry) {
          entry = { userId: user.id, editors: false, publishers: false };
          memberMap.set(user.id, entry);
        }
        entry.publishers = true;
      }
      return [...memberMap.values()].sort((a, b) => a.userId.localeCompare(b.userId));
    },

    async listDocumentEditors(orgId: string, documentId: string): Promise<AuthSubject[]> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      return deps.tupleReader.listDirectUserEditors("Document", documentId);
    },

    async grantDocumentEditor(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.grant({
        namespace: "Document",
        objectId: documentId,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async revokeDocumentEditor(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.revoke({
        namespace: "Document",
        objectId: documentId,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async listDocumentPublishers(orgId: string, documentId: string): Promise<AuthSubject[]> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      return deps.tupleReader.listDirectUserPublishers("Document", documentId);
    },

    async grantDocumentPublisher(orgId: string, documentId: string, userId: string): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "publishers");
      await deps.tupleWriter.grant({
        namespace: "Document",
        objectId: documentId,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async revokeDocumentPublisher(
      orgId: string,
      documentId: string,
      userId: string,
    ): Promise<void> {
      await requireDocumentInOrg(deps.storage, orgId, documentId);
      await deps.tupleWriter.revoke({
        namespace: "Document",
        objectId: documentId,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },
  };
}

async function assertTeamSlotRole(
  resolveUserStaffRole: (orgId: string, userId: string) => Promise<StaffRole | null>,
  orgId: string,
  userId: string,
  slot: "editors" | "publishers",
): Promise<void> {
  const role = await resolveUserStaffRole(orgId, userId);
  if (!role) {
    throw new ValidationError("userId", "User has no staff role in this org");
  }
  const allowed = slot === "editors" ? canJoinTeamEditorSlot(role) : canJoinTeamPublisherSlot(role);
  if (!allowed) {
    throw new ValidationError("userId", `ZITADEL role "${role}" cannot join team ${slot} slot`);
  }
}

async function ensureCollectionExists(
  db: Database,
  orgId: string,
  slug: string,
): Promise<{ id: string }> {
  const [row] = await db
    .select({ id: contentCollections.id })
    .from(contentCollections)
    .where(and(eq(contentCollections.orgId, orgId), eq(contentCollections.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Collection", slug);
  return row;
}

async function resolveParentSlug(db: Database, orgId: string, parentId: string): Promise<string> {
  const [row] = await db
    .select({ slug: contentCollections.slug })
    .from(contentCollections)
    .where(and(eq(contentCollections.orgId, orgId), eq(contentCollections.id, parentId)))
    .limit(1);
  if (!row) throw new NotFoundError("Collection", parentId);
  return row.slug;
}

async function ensureTeamExists(db: Database, orgId: string, slug: string): Promise<void> {
  const [row] = await db
    .select()
    .from(contentTeams)
    .where(and(eq(contentTeams.orgId, orgId), eq(contentTeams.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Team", slug);
}

export type ScopeService = ReturnType<typeof createScopeService>;
