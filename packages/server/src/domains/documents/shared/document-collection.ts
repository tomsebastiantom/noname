/** Normalize folder slug for storage (lowercase, trimmed). */
export function normalizeCollectionSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return slug.length > 0 ? slug : null;
}

/** Parse collection id from API body — uuid string, empty string, or null clears folder. */
export function parseCollectionId(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

export function extractCollectionFromBody(body: Record<string, unknown>): {
  collectionId?: string | null;
  data: Record<string, unknown>;
} {
  if (!Object.hasOwn(body, "collectionId")) {
    return { data: body };
  }
  const { collectionId: raw, ...data } = body;
  return { collectionId: parseCollectionId(raw), data };
}
