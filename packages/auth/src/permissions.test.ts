import { describe, expect, it } from "vitest";
import {
  canDraft,
  canDraftFromPermissions,
  expandPermissions,
  hasPermission,
  PERMISSIONS,
  primaryRoleFromKeys,
  primaryTeamRole,
  ROLE_PERMISSIONS,
} from "./permissions";

describe("permissions", () => {
  it("admin role includes publish permissions", () => {
    const perms = expandPermissions(["admin"]);
    expect(perms).toContain(PERMISSIONS.CONTENT_PUBLISH);
    expect(perms).toContain(PERMISSIONS.LAYOUT_PUBLISH);
    expect(perms).toContain(PERMISSIONS.AUTH_MANAGE);
    expect(perms).toContain(PERMISSIONS.ANALYTICS_VIEW);
  });

  it("editor role includes draft keys but not publish or analytics view", () => {
    const perms = expandPermissions(["editor"]);
    expect(perms).toContain(PERMISSIONS.CONTENT_DRAFT_WRITE);
    expect(perms).toContain(PERMISSIONS.LAYOUT_DRAFT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CONTENT_PUBLISH);
    expect(perms).not.toContain(PERMISSIONS.LAYOUT_PUBLISH);
    expect(perms).not.toContain(PERMISSIONS.AUTH_MANAGE);
    expect(perms).not.toContain(PERMISSIONS.ANALYTICS_VIEW);
  });

  it("customer role is storefront view only", () => {
    expect(expandPermissions(["customer"])).toEqual([PERMISSIONS.STOREFRONT_VIEW]);
  });

  it("canDraftFromPermissions matches expanded editor permissions", () => {
    expect(canDraftFromPermissions(["content:draft_write"])).toBe(true);
    expect(canDraftFromPermissions(["page:draft_write"])).toBe(true);
    expect(canDraftFromPermissions(["storefront:view"])).toBe(false);
  });

  it("canDraft follows ROLE_PERMISSIONS not hardcoded role names", () => {
    expect(canDraft(["editor"])).toBe(true);
    expect(canDraft(["admin"])).toBe(true);
    expect(canDraft(["customer"])).toBe(false);
    expect(canDraft([])).toBe(false);
    expect(canDraft(["unknown_role"])).toBe(false);
  });

  it("primaryRoleFromKeys defaults to customer", () => {
    expect(primaryRoleFromKeys([])).toBe("customer");
    expect(primaryRoleFromKeys(["editor"])).toBe("editor");
  });

  it("primaryTeamRole prefers admin over editor", () => {
    expect(primaryTeamRole(["editor", "admin"])).toBe("admin");
    expect(primaryTeamRole(["editor"])).toBe("editor");
    expect(primaryTeamRole([])).toBeNull();
  });

  it("ROLE_PERMISSIONS covers every platform role", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [
        "access_manager",
        "admin",
        "analyst",
        "customer",
        "editor",
        "flags_manager",
        "publisher",
        "replay_viewer",
        "trace_viewer",
      ].sort(),
    );
  });

  it("hasPermission checks membership", () => {
    const perms = expandPermissions(["editor"]);
    expect(hasPermission(perms, PERMISSIONS.LAYOUT_DRAFT_WRITE)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.LAYOUT_PUBLISH)).toBe(false);
  });
});
