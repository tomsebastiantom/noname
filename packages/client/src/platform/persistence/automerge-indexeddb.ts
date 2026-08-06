import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";

/** Shared IndexedDB database for Automerge Repo blobs (collab today; other features later). */
export const AUTOMERGE_IDB_DATABASE = "noname-automerge";

export type AutomergeIndexedDbScope = "layout-collab" | (string & {});

/** Namespaced object store inside {@link AUTOMERGE_IDB_DATABASE}. */
export function createAutomergeIndexedDbStorage(
  scope: AutomergeIndexedDbScope = "layout-collab",
): IndexedDBStorageAdapter {
  return new IndexedDBStorageAdapter(AUTOMERGE_IDB_DATABASE, scope);
}
