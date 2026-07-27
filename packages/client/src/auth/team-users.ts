import { requireStoreSlug } from "./org";
import { apiHeaders } from "./session";

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
  const res = await fetch(`/api/tenants/${storeSlug}/auth/session`, { headers: apiHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Session check failed (${res.status})`);
  }
  const body = (await res.json()) as { data?: AuthSessionStatus };
  if (!body.data?.userId) {
    throw new Error("Invalid session response");
  }
  return {
    ...body.data,
    roles: body.data.roles ?? [],
    permissions: body.data.permissions ?? [],
  };
}

export async function fetchTeamUsers(): Promise<TeamUser[]> {
  const storeSlug = requireStoreSlug();
  const res = await fetch(`/api/tenants/${storeSlug}/auth/users`, { headers: apiHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to load users (${res.status})`);
  }
  const body = (await res.json()) as { data?: TeamUser[] };
  return body.data ?? [];
}

export async function inviteTeamUser(input: {
  email: string;
  givenName?: string;
  familyName?: string;
  role: TeamMemberRole;
}): Promise<void> {
  const storeSlug = requireStoreSlug();
  const res = await fetch(`/api/tenants/${storeSlug}/auth/users/invite`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Invite failed (${res.status})`);
  }
}

export async function updateTeamUserRole(userId: string, role: TeamMemberRole): Promise<void> {
  const storeSlug = requireStoreSlug();
  const res = await fetch(
    `/api/tenants/${storeSlug}/auth/users/${encodeURIComponent(userId)}/role`,
    {
      method: "PUT",
      headers: { ...apiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Role update failed (${res.status})`);
  }
}
