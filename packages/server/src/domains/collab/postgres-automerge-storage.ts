import type { Chunk, StorageAdapterInterface, StorageKey } from "@automerge/automerge-repo/slim";
import type { CollabAutomergeChunkStore } from "./collab-automerge-chunk-store";

/** Scoped automerge-repo storage for one layout document (multi-server + cold-start). */
export class PostgresAutomergeStorageAdapter implements StorageAdapterInterface {
  constructor(
    private readonly store: CollabAutomergeChunkStore,
    private readonly orgId: string,
    private readonly layoutDocumentId: string,
  ) {}

  load(key: StorageKey): Promise<Uint8Array | undefined> {
    return this.store.load(this.orgId, this.layoutDocumentId, key);
  }

  save(key: StorageKey, data: Uint8Array): Promise<void> {
    return this.store.save(this.orgId, this.layoutDocumentId, key, data);
  }

  remove(key: StorageKey): Promise<void> {
    return this.store.remove(this.orgId, this.layoutDocumentId, key);
  }

  loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    return this.store.loadRange(this.orgId, this.layoutDocumentId, keyPrefix);
  }

  removeRange(keyPrefix: StorageKey): Promise<void> {
    return this.store.removeRange(this.orgId, this.layoutDocumentId, keyPrefix);
  }
}
