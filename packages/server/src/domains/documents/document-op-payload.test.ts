import { describe, expect, it } from "vitest";
import {
  applyJsonPatch,
  buildSpecPatchPayload,
  replaySpecPatches,
} from "./document-op-payload";

describe("document-op-payload", () => {
  it("builds RFC 6902 patches for spec edits", () => {
    const previous = {
      root: "r",
      elements: { r: { type: "Stack", props: { title: "Hi" }, children: [] } },
    };
    const next = {
      root: "r",
      elements: { r: { type: "Stack", props: { title: "Bye" }, children: [] } },
    };

    const payload = buildSpecPatchPayload(previous, next, "2026-08-06T12:00:00.000Z");

    expect(payload.opType).toBe("patch_spec");
    expect(payload.patch).toEqual([
      { op: "replace", path: "/elements/r/props/title", value: "Bye" },
    ]);
    expect(payload.baseUpdatedAt).toBe("2026-08-06T12:00:00.000Z");
  });

  it("replays patches to recover the saved spec", () => {
    const base = {
      root: "r",
      elements: { r: { type: "Stack", props: { title: "Hi" }, children: [] } },
    };
    const step1 = {
      root: "r",
      elements: {
        r: { type: "Stack", props: { title: "Step 1" }, children: [] },
      },
    };
    const step2 = {
      root: "r",
      elements: {
        r: { type: "Stack", props: { title: "Step 2" }, children: [] },
      },
    };

    const payloads = [
      buildSpecPatchPayload(base, step1),
      buildSpecPatchPayload(step1, step2),
    ];

    const replayed = replaySpecPatches(base, payloads);
    expect(replayed).toEqual(step2);
  });

  it("applyJsonPatch handles add and remove", () => {
    const doc = { a: 1, nested: { b: 2 } };
    const patched = applyJsonPatch(doc, [
      { op: "replace", path: "/a", value: 3 },
      { op: "add", path: "/nested/c", value: 4 },
      { op: "remove", path: "/nested/b" },
    ]);
    expect(patched).toEqual({ a: 3, nested: { c: 4 } });
  });
});
