import { describe, expect, it } from "vitest";
import {
  ACCESS_MANAGER_ASSIGNABLE_ROLES,
  canAssignRole,
  isAccessManagerAssignableRole,
} from "./role-assignment";

describe("role-assignment", () => {
  it("access_manager may assign all staff roles except admin", () => {
    expect(ACCESS_MANAGER_ASSIGNABLE_ROLES.sort()).toEqual(
      ["access_manager", "analyst", "editor", "flags_manager", "publisher", "replay_viewer"].sort(),
    );
  });

  it("isAccessManagerAssignableRole rejects admin and customer", () => {
    expect(isAccessManagerAssignableRole("editor")).toBe(true);
    expect(isAccessManagerAssignableRole("access_manager")).toBe(true);
    expect(isAccessManagerAssignableRole("replay_viewer")).toBe(true);
    expect(isAccessManagerAssignableRole("admin")).toBe(false);
    expect(isAccessManagerAssignableRole("customer")).toBe(false);
  });

  it("canAssignRole: admin assigns any staff role", () => {
    expect(canAssignRole(["admin"], "admin")).toBe(true);
    expect(canAssignRole(["admin"], "replay_viewer")).toBe(true);
  });

  it("canAssignRole: access_manager assigns all except admin", () => {
    expect(canAssignRole(["access_manager"], "editor")).toBe(true);
    expect(canAssignRole(["access_manager"], "publisher")).toBe(true);
    expect(canAssignRole(["access_manager"], "access_manager")).toBe(true);
    expect(canAssignRole(["access_manager"], "analyst")).toBe(true);
    expect(canAssignRole(["access_manager"], "replay_viewer")).toBe(true);
    expect(canAssignRole(["access_manager"], "flags_manager")).toBe(true);
    expect(canAssignRole(["access_manager"], "admin")).toBe(false);
    expect(canAssignRole(["access_manager"], "customer")).toBe(false);
  });

  it("canAssignRole: editor cannot assign roles", () => {
    expect(canAssignRole(["editor"], "editor")).toBe(false);
  });
});
