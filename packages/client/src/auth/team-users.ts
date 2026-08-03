import {
  canDraftFromPermissions,
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
  STAFF_ROLES,
  type StaffRole,
} from "@noname/auth";
import { apiFetch, apiFetchData, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export type { StaffRole };

export const STAFF_ROLE_OPTIONS = STAFF_ROLES;

export interface TeamUser {
  userId: string;
  email: string;
  displayName: string;
  state: string;
  role: StaffRole;
  mfaEnrolled: boolean;
}

export interface AuthSessionStatus {
  userId: string;
  requireMfaForAdmin: boolean;
  mfaEnrolled: boolean;
  roles: string[];
  permissions: string[];
  teamRole?: StaffRole | null;
}

export function sessionHasPermission(
  session: AuthSessionStatus | null | undefined,
  permission: PermissionKey,
): boolean {
  const perms = session?.permissions ?? [];
  return hasPermission(perms as PermissionKey[], permission);
}

/** Draft access for visual editor (?edit=true). */
export function sessionCanDraft(session: AuthSessionStatus | null | undefined): boolean {
  return canDraftFromPermissions(session?.permissions ?? []);
}

export { PERMISSIONS };

export async function fetchAuthSessionStatus(): Promise<AuthSessionStatus> {
  const storeSlug = requireStoreSlug();
  const data = await apiFetchData<AuthSessionStatus>(`/api/auth/${storeSlug}/session`);
  if (!data.userId) {
    throw new Error("Invalid session response");
  }
  return {
    ...data,
    roles: data.roles ?? [],
    permissions: data.permissions ?? [],
  };
}

export async function fetchTeamUsers(): Promise<TeamUser[]> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: TeamUser[] }>(`/api/auth/${storeSlug}/users`);
  return body.data ?? [];
}

export async function inviteTeamUser(input: {
  email: string;
  givenName?: string;
  familyName?: string;
  role: StaffRole;
}): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/users/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateTeamUserRole(userId: string, role: StaffRole): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function assignableStaffRoles(session: AuthSessionStatus | null | undefined): StaffRole[] {
  if (sessionHasPermission(session, PERMISSIONS.AUTH_MANAGE)) {
    return STAFF_ROLE_OPTIONS;
  }
  if (sessionHasPermission(session, PERMISSIONS.SCOPE_MANAGE)) {
    return STAFF_ROLE_OPTIONS.filter((role) => role !== "admin");
  }
  return [];
}
