import { describe, expect, it } from "vitest";
import { canJoinTeamEditorSlot, canJoinTeamPublisherSlot } from "./team-slot-validation";

describe("team slot validation", () => {
  it("editor slot accepts editor, publisher, admin", () => {
    expect(canJoinTeamEditorSlot("editor")).toBe(true);
    expect(canJoinTeamEditorSlot("publisher")).toBe(true);
    expect(canJoinTeamEditorSlot("admin")).toBe(true);
  });

  it("editor slot rejects analyst and access_manager", () => {
    expect(canJoinTeamEditorSlot("analyst")).toBe(false);
    expect(canJoinTeamEditorSlot("access_manager")).toBe(false);
  });

  it("publisher slot accepts publisher and admin only", () => {
    expect(canJoinTeamPublisherSlot("publisher")).toBe(true);
    expect(canJoinTeamPublisherSlot("admin")).toBe(true);
    expect(canJoinTeamPublisherSlot("editor")).toBe(false);
  });
});
