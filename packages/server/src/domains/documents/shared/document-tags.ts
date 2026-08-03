/** Normalize content tag keys for storage. */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function extractTagsFromBody(body: Record<string, unknown>): {
  tags?: string[];
  data: Record<string, unknown>;
} {
  if (!Object.hasOwn(body, "tags")) {
    return { data: body };
  }
  const { tags: rawTags, ...data } = body;
  return { tags: normalizeTags(rawTags), data };
}
