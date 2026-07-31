import { describe, expect, it } from "vitest";
import { coerceScalarString } from "./coerce-scalar-string";

describe("coerceScalarString", () => {
  it("returns fallback for objects", () => {
    expect(coerceScalarString({})).toBe("");
    expect(coerceScalarString({}, "x")).toBe("x");
  });

  it("coerces scalars", () => {
    expect(coerceScalarString("hello")).toBe("hello");
    expect(coerceScalarString(42)).toBe("42");
    expect(coerceScalarString(true)).toBe("true");
  });
});
