/** Unit separator — safe join for automerge-repo {@link StorageKey} segments. */
export const AUTOMERGE_STORAGE_KEY_SEP = "\x1f";

export function encodeAutomergeStorageKey(key: string[]): string {
  return key.map((segment) => encodeURIComponent(segment)).join(AUTOMERGE_STORAGE_KEY_SEP);
}

export function decodeAutomergeStorageKey(encoded: string): string[] {
  if (!encoded) return [];
  return encoded.split(AUTOMERGE_STORAGE_KEY_SEP).map((segment) => decodeURIComponent(segment));
}

/** Prefix match consistent with automerge-repo DummyStorageAdapter semantics. */
export function automergeStorageKeyMatchesPrefix(encodedKey: string, keyPrefix: string[]): boolean {
  const prefix = encodeAutomergeStorageKey(keyPrefix);
  if (!prefix) return true;
  return encodedKey === prefix || encodedKey.startsWith(`${prefix}${AUTOMERGE_STORAGE_KEY_SEP}`);
}
