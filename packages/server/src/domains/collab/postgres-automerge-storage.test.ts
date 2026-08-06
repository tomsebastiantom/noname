import type { Chunk, StorageKey } from "@automerge/automerge-repo/slim";
import { describe, expect, it } from "vitest";
import {
  automergeStorageKeyMatchesPrefix,
  encodeAutomergeStorageKey,
} from "./automerge-storage-key";
import type { CollabAutomergeChunkStore } from "./collab-automerge-chunk-store";
import { PostgresAutomergeStorageAdapter } from "./postgres-automerge-storage";

function createMemoryCollabAutomergeChunkStore(): CollabAutomergeChunkStore {
  const rows = new Map<string, Uint8Array>();

  function rowKey(orgId: string, layoutDocumentId: string, storageKey: string): string {
    return `${orgId}\0${layoutDocumentId}\0${storageKey}`;
  }

  return {
    async load(orgId, layoutDocumentId, key) {
      return rows.get(rowKey(orgId, layoutDocumentId, encodeAutomergeStorageKey(key)));
    },
    async save(orgId, layoutDocumentId, key, data) {
      rows.set(rowKey(orgId, layoutDocumentId, encodeAutomergeStorageKey(key)), data);
    },
    async remove(orgId, layoutDocumentId, key) {
      rows.delete(rowKey(orgId, layoutDocumentId, encodeAutomergeStorageKey(key)));
    },
    async loadRange(orgId, layoutDocumentId, keyPrefix) {
      const prefix = encodeAutomergeStorageKey(keyPrefix);
      const chunks: Chunk[] = [];
      for (const [compound, data] of rows.entries()) {
        const [storedOrg, storedLayout, storageKey] = compound.split("\0");
        if (storedOrg !== orgId || storedLayout !== layoutDocumentId) continue;
        if (!automergeStorageKeyMatchesPrefix(storageKey, keyPrefix)) continue;
        if (prefix && storageKey !== prefix && !storageKey.startsWith(`${prefix}\x1f`)) continue;
        chunks.push({
          key: storageKey.split("\x1f").map((segment) => decodeURIComponent(segment)),
          data,
        });
      }
      return chunks;
    },
    async removeRange(orgId, layoutDocumentId, keyPrefix) {
      const matches = await this.loadRange(orgId, layoutDocumentId, keyPrefix);
      for (const chunk of matches) {
        await this.remove(orgId, layoutDocumentId, chunk.key as StorageKey);
      }
    },
  };
}

describe("PostgresAutomergeStorageAdapter", () => {
  it("save/load/remove chunks for one layout scope", async () => {
    const store = createMemoryCollabAutomergeChunkStore();
    const adapter = new PostgresAutomergeStorageAdapter(store, "org-1", "layout-1");
    const key = ["doc-1", "snapshot", "hash-a"];
    const data = new Uint8Array([1, 2, 3]);

    await adapter.save(key, data);
    await expect(adapter.load(key)).resolves.toEqual(data);

    const range = await adapter.loadRange(["doc-1"]);
    expect(range).toHaveLength(1);
    expect(range[0]?.data).toEqual(data);

    await adapter.remove(key);
    await expect(adapter.load(key)).resolves.toBeUndefined();
  });

  it("does not leak chunks across layouts in the same org", async () => {
    const store = createMemoryCollabAutomergeChunkStore();
    const layoutA = new PostgresAutomergeStorageAdapter(store, "org-1", "layout-a");
    const layoutB = new PostgresAutomergeStorageAdapter(store, "org-1", "layout-b");
    const key = ["doc-1", "incremental", "x"];

    await layoutA.save(key, new Uint8Array([9]));
    await expect(layoutB.load(key)).resolves.toBeUndefined();
  });
});
