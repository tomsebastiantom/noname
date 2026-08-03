import { isPlatformRole, PLATFORM_ROLES, type PlatformRole } from "./permissions";

/** Roles only store admin may assign. */
export const ADMIN_ONLY_ASSIGNABLE_ROLES = ["admin"] as const satisfies readonly PlatformRole[];

export type AdminOnlyAssignableRole = (typeof ADMIN_ONLY_ASSIGNABLE_ROLES)[number];

/** All staff roles an access_manager may assign — every role except admin. */
export const ACCESS_MANAGER_ASSIGNABLE_ROLES = PLATFORM_ROLES.filter(
  (role): role is Exclude<PlatformRole, "admin" | "customer"> =>
    role !== "admin" && role !== "customer",
);

export type AccessManagerAssignableRole = Exclude<PlatformRole, "admin" | "customer">;

export function isAccessManagerAssignableRole(value: string): value is AccessManagerAssignableRole {
  return isPlatformRole(value) && value !== "admin" && value !== "customer";
}

export function canAssignRole(assignerRoles: Iterable<PlatformRole>, targetRole: string): boolean {
  if (!isPlatformRole(targetRole)) return false;
  if (targetRole === "customer") return false;

  const assigner = new Set(assignerRoles);
  if (assigner.has("admin")) return true;
  if (assigner.has("access_manager")) {
    return isAccessManagerAssignableRole(targetRole);
  }
  return false;
}
