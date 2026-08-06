import type { Chunk, StorageKey } from "@automerge/automerge-repo/slim";
import { and, eq, or, sql } from "drizzle-orm";
import type { Database } from "../../drizzle";
import {
  AUTOMERGE_STORAGE_KEY_SEP,
  automergeStorageKeyMatchesPrefix,
  decodeAutomergeStorageKey,
  encodeAutomergeStorageKey,
} from "./automerge-storage-key";
import { createR2CollabAutomergeChunkStore } from "./r2-automerge-chunk-store";
import { collabAutomergeChunks } from "./schema";

export type CollabAutomergeChunkStore = {
  load(orgId: string, layoutDocumentId: string, key: StorageKey): Promise<Uint8Array | undefined>;
  save(orgId: string, layoutDocumentId: string, key: StorageKey, data: Uint8Array): Promise<void>;
  remove(orgId: string, layoutDocumentId: string, key: StorageKey): Promise<void>;
  loadRange(orgId: string, layoutDocumentId: string, keyPrefix: StorageKey): Promise<Chunk[]>;
  removeRange(orgId: string, layoutDocumentId: string, keyPrefix: StorageKey): Promise<void>;
};

function binaryToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function binaryFromBase64(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

export function createPostgresCollabAutomergeChunkStore(db: Database): CollabAutomergeChunkStore {
  return {
    async load(orgId, layoutDocumentId, key) {
      const storageKey = encodeAutomergeStorageKey(key);
      const [row] = await db
        .select({ binary: collabAutomergeChunks.binary })
        .from(collabAutomergeChunks)
        .where(
          and(
            eq(collabAutomergeChunks.orgId, orgId),
            eq(collabAutomergeChunks.layoutDocumentId, layoutDocumentId),
            eq(collabAutomergeChunks.storageKey, storageKey),
          ),
        )
        .limit(1);
      return row ? binaryFromBase64(row.binary) : undefined;
    },

    async save(orgId, layoutDocumentId, key, data) {
      const storageKey = encodeAutomergeStorageKey(key);
      const binary = binaryToBase64(data);
      await db
        .insert(collabAutomergeChunks)
        .values({
          orgId,
          layoutDocumentId,
          storageKey,
          binary,
        })
        .onConflictDoUpdate({
          target: [
            collabAutomergeChunks.orgId,
            collabAutomergeChunks.layoutDocumentId,
            collabAutomergeChunks.storageKey,
          ],
          set: {
            binary,
            updated_at: new Date(),
          },
        });
    },

    async remove(orgId, layoutDocumentId, key) {
      const storageKey = encodeAutomergeStorageKey(key);
      await db
        .delete(collabAutomergeChunks)
        .where(
          and(
            eq(collabAutomergeChunks.orgId, orgId),
            eq(collabAutomergeChunks.layoutDocumentId, layoutDocumentId),
            eq(collabAutomergeChunks.storageKey, storageKey),
          ),
        );
    },

    async loadRange(orgId, layoutDocumentId, keyPrefix) {
      const prefix = encodeAutomergeStorageKey(keyPrefix);
      const rows = await db
        .select({
          storageKey: collabAutomergeChunks.storageKey,
          binary: collabAutomergeChunks.binary,
        })
        .from(collabAutomergeChunks)
        .where(
          and(
            eq(collabAutomergeChunks.orgId, orgId),
            eq(collabAutomergeChunks.layoutDocumentId, layoutDocumentId),
            prefix
              ? or(
                  eq(collabAutomergeChunks.storageKey, prefix),
                  sql`${collabAutomergeChunks.storageKey} LIKE ${`${prefix}${AUTOMERGE_STORAGE_KEY_SEP}%`}`,
                )
              : sql`true`,
          ),
        );

      return rows
        .filter((row) => automergeStorageKeyMatchesPrefix(row.storageKey, keyPrefix))
        .map((row) => ({
          key: decodeAutomergeStorageKey(row.storageKey),
          data: binaryFromBase64(row.binary),
        }));
    },

    async removeRange(orgId, layoutDocumentId, keyPrefix) {
      const rows = await db
        .select({ storageKey: collabAutomergeChunks.storageKey })
        .from(collabAutomergeChunks)
        .where(
          and(
            eq(collabAutomergeChunks.orgId, orgId),
            eq(collabAutomergeChunks.layoutDocumentId, layoutDocumentId),
          ),
        );

      const toDelete = rows
        .map((row) => row.storageKey)
        .filter((storageKey) => automergeStorageKeyMatchesPrefix(storageKey, keyPrefix));
      if (toDelete.length === 0) return;

      for (const storageKey of toDelete) {
        await db
          .delete(collabAutomergeChunks)
          .where(
            and(
              eq(collabAutomergeChunks.orgId, orgId),
              eq(collabAutomergeChunks.layoutDocumentId, layoutDocumentId),
              eq(collabAutomergeChunks.storageKey, storageKey),
            ),
          );
      }
    },
  };
}

/** R2 when configured (same env as assets/replay); otherwise Postgres. */
export function createCollabAutomergeChunkStore(db: Database): CollabAutomergeChunkStore {
  const r2 = createR2CollabAutomergeChunkStore();
  if (r2) return r2;
  return createPostgresCollabAutomergeChunkStore(db);
}
