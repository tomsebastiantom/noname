import { describe, expect, it } from "vitest";
import { applyFieldChange } from "./types";

describe("applyFieldChange", () => {
  it("updates one field without mutating the original object", () => {
    const values = { title: "Hello", showPrice: true };

    const next = applyFieldChange(values, "title", "Summer Sale");

    expect(next).toEqual({ title: "Summer Sale", showPrice: true });
    expect(values).toEqual({ title: "Hello", showPrice: true });
  });
});
