import { describe, expect, it, beforeEach } from "vitest";
import { clientOpHeaders, getEditorClientId, resetClientOpStateForTests } from "./client-op";

describe("client-op", () => {
  beforeEach(() => {
    resetClientOpStateForTests();
  });

  it("returns stable client id within the tab session", () => {
    const a = getEditorClientId();
    const b = getEditorClientId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("increments client seq on each save header", () => {
    const first = clientOpHeaders();
    const second = clientOpHeaders();
    expect(first["X-Client-Id"]).toBe(second["X-Client-Id"]);
    expect(Number(first["X-Client-Seq"])).toBe(1);
    expect(Number(second["X-Client-Seq"])).toBe(2);
  });
});
