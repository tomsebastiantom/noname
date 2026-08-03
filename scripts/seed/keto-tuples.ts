/**
 * Keto tuple helpers for demo seed (imported by demo.ts / demo-users.ts).
 * Run full demo: pnpm seed:demo
 */
import "dotenv/config";

const KETO_READ = process.env.KETO_READ_URL?.trim() || "localhost:4466";
const KETO_WRITE = process.env.KETO_WRITE_URL?.trim() || "localhost:4467";
const API_BASE = process.env.API_BASE ?? "http://localhost:3000";

function ketoBase(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url.replace(/\/$/, "");
  return `http://${url.replace(/\/$/, "")}`;
}

export async function assertKetoReady(): Promise<void> {
  const res = await fetch(`${ketoBase(KETO_READ)}/health/ready`);
  if (!res.ok) {
    throw new Error(
      `Keto not ready (${res.status}) — start infra: podman compose up -d keto`,
    );
  }
}

type KetoTupleBody =
  | { namespace: string; object: string; relation: string; subject_id: string }
  | {
      namespace: string;
      object: string;
      relation: string;
      subject_set: { namespace: string; object: string; relation: string };
    };

async function ketoPut(body: KetoTupleBody): Promise<void> {
  const res = await fetch(`${ketoBase(KETO_WRITE)}/admin/relation-tuples`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Keto grant failed: ${res.status} ${await res.text()}`);
  }
}

export function subFromAccessToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: string;
    };
    return typeof payload.sub === "string" && payload.sub.trim() !== "" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function grantStoreEditor(storeId: string, userSub: string): Promise<void> {
  await ketoPut({
    namespace: "Store",
    object: storeId,
    relation: "editors",
    subject_id: `User:${userSub}`,
  });
}

/** All store editors may edit this document (OPL SubjectSet<Store, "editors">). */
export async function linkDocumentToStoreEditors(
  documentId: string,
  storeId: string,
): Promise<void> {
  await ketoPut({
    namespace: "Document",
    object: documentId,
    relation: "editors",
    subject_set: { namespace: "Store", object: storeId, relation: "editors" },
  });
}

export async function grantTeamEditor(team: string, userSub: string): Promise<void> {
  await ketoPut({
    namespace: "Team",
    object: team,
    relation: "editors",
    subject_id: `User:${userSub}`,
  });
}

export async function bindCollectionTeamEditors(collection: string, team: string): Promise<void> {
  await ketoPut({
    namespace: "Collection",
    object: collection,
    relation: "editors",
    subject_set: { namespace: "Team", object: team, relation: "editors" },
  });
}

export async function grantTeamPublisher(team: string, userSub: string): Promise<void> {
  await ketoPut({
    namespace: "Team",
    object: team,
    relation: "publishers",
    subject_id: `User:${userSub}`,
  });
}

export async function bindCollectionTeamPublishers(collection: string, team: string): Promise<void> {
  await ketoPut({
    namespace: "Collection",
    object: collection,
    relation: "publishers",
    subject_set: { namespace: "Team", object: team, relation: "publishers" },
  });
}

export async function linkDocumentToTeam(_documentId: string, _team: string): Promise<void> {
  // Deprecated — Postgres collection_id + Collection↔Team bindings replace Document#parents@Team.
}

interface DocumentRow {
  id: string;
  key: string;
  type?: string;
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function fetchJsonOptional<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function collectDocumentIds(orgHeaders: () => Record<string, string>): Promise<string[]> {
  const headers = orgHeaders();
  const ids = new Set<string>();

  const { data: layouts } = await fetchJson<{ data: DocumentRow[] }>(
    `${API_BASE}/api/documents/layout`,
    headers,
  );
  for (const row of layouts) ids.add(row.id);

  const { data: types } = await fetchJson<{ data: { name: string }[] }>(
    `${API_BASE}/api/documents/content-types`,
    headers,
  );
  for (const type of types) {
    if (type.name === "content_type") continue;
    const { data: entries } = await fetchJson<{ data: DocumentRow[] }>(
      `${API_BASE}/api/documents/${encodeURIComponent(type.name)}`,
      headers,
    );
    for (const row of entries) ids.add(row.id);
  }

  const tree = await fetchJsonOptional<{ data: { id?: string } | null }>(
    `${API_BASE}/api/documents/page_tree/main`,
    headers,
  );
  if (tree?.data?.id) ids.add(tree.data.id);

  const pagesRes = await fetchJsonOptional<{ data: DocumentRow[] }>(
    `${API_BASE}/api/documents/routing/pages`,
    headers,
  );
  if (pagesRes?.data) {
    for (const row of pagesRes.data) ids.add(row.id);
  }

  return [...ids];
}

/** Grant store editor + link all org documents to Store#editors (demo admin can edit). */
export async function seedOrgEditorAccess(options: {
  orgId: string;
  editorSubs: string[];
  orgHeaders: () => Record<string, string>;
}): Promise<void> {
  await assertKetoReady();

  const subs = [...new Set(options.editorSubs.filter(Boolean))];
  if (subs.length === 0) {
    console.warn("Keto seed skipped — no editor user subs (need seed admin JWT)");
    return;
  }

  for (const sub of subs) {
    await grantStoreEditor(options.orgId, sub);
    console.log(`Keto: Store:${options.orgId}#editors@User:${sub}`);
  }

  const documentIds = await collectDocumentIds(options.orgHeaders);
  for (const docId of documentIds) {
    await linkDocumentToStoreEditors(docId, options.orgId);
  }
  console.log(`Keto: linked ${documentIds.length} documents to Store:${options.orgId}#editors`);
}

interface LayoutRow {
  id: string;
  key: string;
}

export async function seedMarketingScopeDemo(options: {
  orgHeaders: () => Record<string, string>;
  storeSlug: string;
  marketingCollection?: string;
  marketingTeam?: string;
  layoutTemplate?: string;
  editorSub: string;
  publisherSub?: string;
}): Promise<void> {
  await assertKetoReady();

  const collection = options.marketingCollection ?? "marketing";
  const team = options.marketingTeam ?? "marketing-team";
  const template = options.layoutTemplate ?? "home";
  const headers = options.orgHeaders();
  const storeSlug = options.storeSlug;
  const scopeBase = `${API_BASE}/api/auth/${storeSlug}/scope`;

  const scopeHeaders = { ...headers, "Content-Type": "application/json" };

  const collectionRes = await fetch(`${scopeBase}/collections`, {
    method: "POST",
    headers: scopeHeaders,
    body: JSON.stringify({ slug: collection, label: "Marketing" }),
  });
  if (!collectionRes.ok && collectionRes.status !== 409) {
    const body = await collectionRes.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string; code?: string };
      detail = parsed.code ? `${parsed.code}: ${parsed.error ?? body}` : body;
    } catch {
      // keep raw body
    }
    console.warn(`Scope folder create: ${collectionRes.status} ${detail}`);
  }

  const teamRes = await fetch(`${scopeBase}/teams`, {
    method: "POST",
    headers: scopeHeaders,
    body: JSON.stringify({ slug: team, label: "Marketing team" }),
  });
  if (!teamRes.ok && teamRes.status !== 409) {
    const body = await teamRes.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string; code?: string };
      detail = parsed.code ? `${parsed.code}: ${parsed.error ?? body}` : body;
    } catch {
      // keep raw body
    }
    console.warn(`Scope team create: ${teamRes.status} ${detail}`);
  }

  await fetch(
    `${scopeBase}/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/editors`,
    { method: "PUT", headers: scopeHeaders },
  ).catch(() => undefined);

  await fetch(
    `${scopeBase}/collection/${encodeURIComponent(collection)}/teams/${encodeURIComponent(team)}/publishers`,
    { method: "PUT", headers: scopeHeaders },
  ).catch(() => undefined);

  const collections = await fetchJson<{ data: { id: string; slug: string }[] }>(
    `${scopeBase}/collections`,
    headers,
  );
  const marketingFolder = collections.data.find((row) => row.slug === collection);
  if (!marketingFolder) {
    throw new Error(`Folder "${collection}" not found after create`);
  }

  const { data: layouts } = await fetchJson<{ data: DocumentRow[] }>(
    `${API_BASE}/api/documents/layout?segment=default&templateName=${template}`,
    headers,
  );
  const layout = layouts.find((row) => row.key === template);
  if (!layout) {
    throw new Error(`Layout "${template}" not found — run layout seed first`);
  }

  const { data: layoutDoc } = await fetchJson<{
    data: { data: { spec?: Record<string, unknown> } };
  }>(`${API_BASE}/api/documents/layout/${layout.id}`, headers);
  const spec = layoutDoc.data.spec ?? {};

  const putRes = await fetch(`${API_BASE}/api/documents/layout/${layout.id}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ spec, collectionId: marketingFolder.id }),
  });
  if (!putRes.ok) {
    throw new Error(`Folder layout failed: ${putRes.status} ${await putRes.text()}`);
  }

  await bindCollectionTeamEditors(collection, team);
  await bindCollectionTeamPublishers(collection, team);
  await grantTeamEditor(team, options.editorSub);
  console.log(`Scope demo: Collection:${collection}#editors@Team:${team}#editors`);
  console.log(`Scope demo: Collection:${collection}#publishers@Team:${team}#publishers`);
  console.log(`Scope demo: Team:${team}#editors@User:${options.editorSub}`);
  if (options.publisherSub) {
    await grantTeamPublisher(team, options.publisherSub);
    console.log(`Scope demo: Team:${team}#publishers@User:${options.publisherSub}`);
  }
  console.log(`Scope demo: layout ${layout.id} in folder "${collection}"`);
}
