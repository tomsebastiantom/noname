import type { PlatformRole } from "./permissions";

/** ZITADEL roles allowed on Keto `Team#editors` (see ACCESS-AND-ROLES.md). */
export function canJoinTeamEditorSlot(role: PlatformRole): boolean {
  return role === "editor" || role === "publisher" || role === "admin";
}

/** ZITADEL roles allowed on Keto `Team#publishers`. */
export function canJoinTeamPublisherSlot(role: PlatformRole): boolean {
  return role === "publisher" || role === "admin";
}
