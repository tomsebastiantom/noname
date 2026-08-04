import { apiFetchData, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export interface DocumentEditor {
  type: "User";
  id: string;
}

export interface ScopeCatalogEntry {
  id?: string;
  slug: string;
  label: string;
  parentId?: string | null;
}

export interface CollectionTeamBinding {
  collection: string;
  team: string;
  editors: boolean;
  publishers: boolean;
}

export interface CollectionAgentBinding {
  collection: string;
  agent: string;
}

export interface TeamMemberEntry {
  userId: string;
  editors: boolean;
  publishers: boolean;
}

export async function fetchScopeCollections(): Promise<ScopeCatalogEntry[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<ScopeCatalogEntry[]>(`/api/auth/${storeSlug}/scope/collections`);
}

export async function createScopeCollection(
  slug: string,
  label?: string,
  parentId?: string | null,
): Promise<void> {
  const storeSlug = requireStoreSlug();
  const body: { slug: string; label?: string; parentId?: string | null } = { slug, label };
  if (parentId !== undefined) body.parentId = parentId;
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/collections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchScopeTeams(): Promise<ScopeCatalogEntry[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<ScopeCatalogEntry[]>(`/api/auth/${storeSlug}/scope/teams`);
}

export async function fetchScopeBindings(): Promise<CollectionTeamBinding[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<CollectionTeamBinding[]>(`/api/auth/${storeSlug}/scope/bindings`);
}

export async function fetchScopeAgentBindings(): Promise<CollectionAgentBinding[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<CollectionAgentBinding[]>(`/api/auth/${storeSlug}/scope/agent-bindings`);
}

export async function unbindCollectionAgentEditors(
  collection: string,
  agent: string,
): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/collection/${encodeURIComponent(collection)}/agents/${encodeURIComponent(agent)}/editors`,
    { method: "DELETE" },
  );
}

export async function fetchTeamMembers(team: string): Promise<TeamMemberEntry[]> {
  const storeSlug = requireStoreSlug();
  return apiFetchData<TeamMemberEntry[]>(
    `/api/auth/${storeSlug}/scope/team/${encodeURIComponent(team)}/members`,
  );
}

export async function createScopeTeam(slug: string, label?: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, label }),
  });
}

export async function deleteScopeCollection(slug: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/collections/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function deleteScopeTeam(slug: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/scope/teams/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function bindCollectionTeamEditors(collection: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/editors`,
    { method: "PUT" },
  );
}

export async function bindCollectionTeamPublishers(
  collection: string,
  team: string,
): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/publishers`,
    { method: "PUT" },
  );
}

export async function unbindCollectionTeamEditors(collection: string, team: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/editors`,
    { method: "DELETE" },
  );
}

export async function unbindCollectionTeamPublishers(
  collection: string,
  team: string,
): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(
    `/api/auth/${storeSlug}/scope/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/publishers`,
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
