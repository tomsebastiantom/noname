import { apiFetchData, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export interface DocumentEditor {
  type: "User";
  id: string;
}

export interface ScopeCatalogEntry {
  slug: string;
  label: string;
}

export async function fetchScopeTags(): Promise<ScopeCatalogEntry[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<ScopeCatalogEntry[]>(`/api/auth/${storeSlug}/scope/tags`);
}

export async function createScopeTag(slug: string, label?: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, label }),
  });
}

export async function fetchScopeTeams(): Promise<ScopeCatalogEntry[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<ScopeCatalogEntry[]>(`/api/auth/${storeSlug}/scope/teams`);
}

export async function createScopeTeam(slug: string, label?: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, label }),
  });
}

export async function deleteScopeTag(slug: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/tags/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function deleteScopeTeam(slug: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/teams/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function bindTagTeamEditors(tag: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/tag/${encodeURIComponent(tag)}/teams/${encodeURIComponent(team)}/editors`,
    { method: "PUT" },
  );
}

export async function bindTagTeamPublishers(tag: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/tag/${encodeURIComponent(tag)}/teams/${encodeURIComponent(team)}/publishers`,
    { method: "PUT" },
  );
}

export async function unbindTagTeamEditors(tag: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/tag/${encodeURIComponent(tag)}/teams/${encodeURIComponent(team)}/editors`,
    { method: "DELETE" },
  );
}

export async function unbindTagTeamPublishers(tag: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/tag/${encodeURIComponent(tag)}/teams/${encodeURIComponent(team)}/publishers`,
    { method: "DELETE" },
  );
}

export async function grantTeamEditor(team: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/team/${encodeURIComponent(team)}/editors/${encodeURIComponent(userId)}`,
    { method: "PUT" },
  );
}

export async function revokeTeamEditor(team: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/team/${encodeURIComponent(team)}/editors/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function grantTeamPublisher(team: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/team/${encodeURIComponent(team)}/publishers/${encodeURIComponent(userId)}`,
    { method: "PUT" },
  );
}

export async function revokeTeamPublisher(team: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/team/${encodeURIComponent(team)}/publishers/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function fetchDocumentEditors(documentId: string): Promise<DocumentEditor[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<DocumentEditor[]>(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/editors`,
  );
}

export async function grantDocumentEditor(documentId: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/editors/${encodeURIComponent(userId)}`,
    { method: "PUT" },
  );
}

export async function revokeDocumentEditor(documentId: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/editors/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function fetchDocumentPublishers(documentId: string): Promise<DocumentEditor[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<DocumentEditor[]>(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/publishers`,
  );
}

export async function grantDocumentPublisher(documentId: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/publishers/${encodeURIComponent(userId)}`,
    { method: "PUT" },
  );
}

export async function revokeDocumentPublisher(documentId: string, userId: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/document/${encodeURIComponent(documentId)}/publishers/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}
