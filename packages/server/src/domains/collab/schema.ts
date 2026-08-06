import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Automerge-repo binary chunks for layout collab (live editing; publish stays JSON spec). */
export const collabAutomergeChunks = pgTable(
  "collab_automerge_chunks",
  {
    orgId: text("org_id").notNull(),
    layoutDocumentId: uuid("layout_document_id").notNull(),
    storageKey: text("storage_key").notNull(),
    /** Base64-encoded Automerge chunk bytes. */
    binary: text("binary").notNull(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.layoutDocumentId, t.storageKey] }),
    layoutIdx: index("collab_automerge_chunks_layout").on(t.orgId, t.layoutDocumentId),
  }),
);
