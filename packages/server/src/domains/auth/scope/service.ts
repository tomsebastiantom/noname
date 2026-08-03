import { canJoinTeamEditorSlot, canJoinTeamPublisherSlot, type StaffRole } from "@noname/auth";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import type { DocumentStorage } from "../../documents/ports";
import { contentTags, contentTeams } from "../../documents/schema";
import { normalizeTags } from "../../documents/shared/document-tags";
import type { AuthorizationPort, AuthSubject, RelationTuple } from "../authorization-port";

async function revokeTuples(
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  tuples: RelationTuple[],
): Promise<void> {
  for (const tuple of tuples) {
    await tupleWriter.revoke(tuple);
  }
}

async function revokeAllTagTuples(
  tupleReader: Pick<AuthorizationPort, "listRelationTuples">,
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  tagSlug: string,
): Promise<void> {
  const tuples = await tupleReader.listRelationTuples({
    namespace: "Tag",
    objectId: tagSlug,
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

    const tagBindings = await tupleReader.listRelationTuples({
      namespace: "Tag",
      subjectSet: { namespace: "Team", object: teamSlug, relation },
    });
    await revokeTuples(tupleWriter, tagBindings);
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
  const slug = normalizeTags([raw])[0];
  if (!slug) throw new ValidationError(label, "Invalid slug");
  return slug;
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
    async listTags(orgId: string): Promise<{ slug: string; label: string }[]> {
      const rows = await deps.db.select().from(contentTags).where(eq(contentTags.orgId, orgId));
      return rows
        .map((r) => ({ slug: r.slug, label: r.label }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async createTag(orgId: string, slug: string, label: string): Promise<void> {
      const normalized = slugOrThrow(slug, "slug");
      const trimmedLabel = label.trim() || normalized;
      await deps.db
        .insert(contentTags)
        .values({
          orgId,
          slug: normalized,
          label: trimmedLabel,
        })
        .onConflictDoUpdate({
          target: [contentTags.orgId, contentTags.slug],
          set: { label: trimmedLabel },
        });
    },

    async deleteTag(orgId: string, slug: string): Promise<void> {
      const tagSlug = slugOrThrow(slug, "tag");
      await ensureTagExists(deps.db, orgId, tagSlug);
      await revokeAllTagTuples(deps.tupleReader, deps.tupleWriter, tagSlug);
      await deps.db
        .delete(contentTags)
        .where(and(eq(contentTags.orgId, orgId), eq(contentTags.slug, tagSlug)));
    },

    async listTeams(orgId: string): Promise<{ slug: string; label: string }[]> {
      const rows = await deps.db.select().from(contentTeams).where(eq(contentTeams.orgId, orgId));
      return rows
        .map((r) => ({ slug: r.slug, label: r.label }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
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

    async bindTagTeamEditors(orgId: string, tag: string, team: string): Promise<void> {
      const tagSlug = slugOrThrow(tag, "tag");
      const teamSlug = slugOrThrow(team, "team");
      await ensureTagExists(deps.db, orgId, tagSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Tag",
        objectId: tagSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async bindTagTeamPublishers(orgId: string, tag: string, team: string): Promise<void> {
      const tagSlug = slugOrThrow(tag, "tag");
      const teamSlug = slugOrThrow(team, "team");
      await ensureTagExists(deps.db, orgId, tagSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Tag",
        objectId: tagSlug,
        relation: "publishers",
        subject: { type: "Team", id: teamSlug, relation: "publishers" },
      });
    },

    async unbindTagTeamEditors(orgId: string, tag: string, team: string): Promise<void> {
      const tagSlug = slugOrThrow(tag, "tag");
      const teamSlug = slugOrThrow(team, "team");
      await ensureTagExists(deps.db, orgId, tagSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Tag",
        objectId: tagSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async unbindTagTeamPublishers(orgId: string, tag: string, team: string): Promise<void> {
      const tagSlug = slugOrThrow(tag, "tag");
      const teamSlug = slugOrThrow(team, "team");
      await ensureTagExists(deps.db, orgId, tagSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Tag",
        objectId: tagSlug,
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

async function ensureTagExists(db: Database, orgId: string, slug: string): Promise<void> {
  const [row] = await db
    .select()
    .from(contentTags)
    .where(and(eq(contentTags.orgId, orgId), eq(contentTags.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Tag", slug);
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
