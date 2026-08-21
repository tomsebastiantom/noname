import { canJoinTeamEditorSlot, canJoinTeamPublisherSlot, type StaffRole } from "@noname/auth";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import type { DocumentStorage } from "../../documents/ports";
import { contentCollections, contentTeams } from "../../documents/schema";
import { normalizeCollectionSlug } from "../../documents/shared/document-collection";
import type { AuthorizationPort, RelationTuple } from "../authorization-port";

/** Revokes are independent Keto writes on different tuples — fan them out instead of awaiting
 * one at a time, so removing a user/team from a large collection is O(1) round-trips in wall
 * time rather than O(tuples) sequential HTTP calls to Keto. */
export async function revokeTuples(
  tupleWriter: Pick<AuthorizationPort, "revoke">,
  tuples: RelationTuple[],
): Promise<void> {
  await Promise.all(tuples.map((tuple) => tupleWriter.revoke(tuple)));
}

export async function revokeAllCollectionTuples(
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

export async function revokeAllTeamTuples(
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

export async function requireDocumentInOrg(
  storage: DocumentStorage,
  orgId: string,
  documentId: string,
): Promise<void> {
  const doc = await storage.findDocumentById(documentId);
  if (!doc || doc.orgId !== orgId) {
    throw new NotFoundError("Document", documentId);
  }
}

export function slugOrThrow(raw: string, label: string): string {
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

export interface CollectionAgentBinding {
  collection: string;
  agent: string;
}

export interface TeamMemberEntry {
  userId: string;
  editors: boolean;
  publishers: boolean;
}

export async function assertTeamSlotRole(
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

export async function ensureCollectionExists(
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

export async function resolveParentSlug(
  db: Database,
  orgId: string,
  parentId: string,
): Promise<string> {
  const [row] = await db
    .select({ slug: contentCollections.slug })
    .from(contentCollections)
    .where(and(eq(contentCollections.orgId, orgId), eq(contentCollections.id, parentId)))
    .limit(1);
  if (!row) throw new NotFoundError("Collection", parentId);
  return row.slug;
}

export async function ensureTeamExists(db: Database, orgId: string, slug: string): Promise<void> {
  const [row] = await db
    .select()
    .from(contentTeams)
    .where(and(eq(contentTeams.orgId, orgId), eq(contentTeams.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Team", slug);
}
