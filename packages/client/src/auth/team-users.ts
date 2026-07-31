import { apiFetch, apiFetchData, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export type TeamMemberRole = "admin" | "editor";

export interface TeamUser {
  userId: string;
  email: string;
  displayName: string;
  state: string;
  role: TeamMemberRole;
  mfaEnrolled: boolean;
}

export interface AuthSessionStatus {
  userId: string;
  requireMfaForAdmin: boolean;
  mfaEnrolled: boolean;
  roles: string[];
  permissions: string[];
  teamRole?: "admin" | "editor" | null;
}

export function sessionHasPermission(
  session: AuthSessionStatus | null | undefined,
  permission: string,
): boolean {
  return session?.permissions.includes(permission) === true;
}

/** Draft access for visual editor (?edit=true) — layout or content draft_write. */
export function sessionCanDraft(session: AuthSessionStatus | null | undefined): boolean {
  return (
    sessionHasPermission(session, "layout:draft_write") ||
    sessionHasPermission(session, "content:draft_write")
  );
}

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
  role: TeamMemberRole;
}): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/users/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateTeamUserRole(userId: string, role: TeamMemberRole): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}
