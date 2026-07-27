import { describe, expect, it } from "vitest";
import { EDIT_MODE_FORBIDDEN_ERROR, isEditModeUrl } from "./edit-mode";

describe("isEditModeUrl", () => {
  it("detects edit=true", () => {
    expect(isEditModeUrl(new URL("http://yogastore.localhost/?edit=true"))).toBe(true);
    expect(
      isEditModeUrl(new URL("http://yogastore.localhost/api/edge/schema/yogastore?edit=true")),
    ).toBe(true);
  });

  it("ignores other values", () => {
    expect(isEditModeUrl(new URL("http://yogastore.localhost/?edit=false"))).toBe(false);
    expect(isEditModeUrl(new URL("http://yogastore.localhost/"))).toBe(false);
  });
});

describe("EDIT_MODE_FORBIDDEN_ERROR", () => {
  it("is a stable forbidden message", () => {
    expect(EDIT_MODE_FORBIDDEN_ERROR).toBe("Forbidden: edit mode requires editor or admin role");
  });
});
