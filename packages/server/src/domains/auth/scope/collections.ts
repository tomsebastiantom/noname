import { and, eq } from "drizzle-orm";
import { ValidationError } from "../../../shared/domain-error";
import { contentCollections, documents } from "../../documents/schema";
import type { ScopeDeps } from "./deps";
import {
  ensureCollectionExists,
  resolveParentSlug,
  revokeAllCollectionTuples,
  slugOrThrow,
} from "./helpers";

export function createCollectionOps(deps: ScopeDeps) {
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
  };
}
