import { describe, expect, it } from "vitest";
import {
  AUTOMERGE_STORAGE_KEY_SEP,
  automergeStorageKeyMatchesPrefix,
  decodeAutomergeStorageKey,
  encodeAutomergeStorageKey,
} from "./automerge-storage-key";

describe("automerge storage key encoding", () => {
  it("round-trips key segments", () => {
    const key = ["doc-id", "incremental", "abc/def"];
    expect(decodeAutomergeStorageKey(encodeAutomergeStorageKey(key))).toEqual(key);
  });

  it("matches prefix without false positives", () => {
    const docId = "11111111-1111-1111-1111-111111111111";
    const other = "11111111-1111-1111-1111-111111111112";
    const encodedChild = encodeAutomergeStorageKey([docId, "snapshot", "hash"]);
    const encodedOther = encodeAutomergeStorageKey([other, "snapshot", "hash"]);

    expect(automergeStorageKeyMatchesPrefix(encodedChild, [docId])).toBe(true);
    expect(automergeStorageKeyMatchesPrefix(encodedOther, [docId])).toBe(false);
    expect(automergeStorageKeyMatchesPrefix(encodedChild, [docId, "snapshot"])).toBe(true);
  });

  it("uses separator between segments", () => {
    expect(encodeAutomergeStorageKey(["a", "b"])).toContain(AUTOMERGE_STORAGE_KEY_SEP);
  });
});
