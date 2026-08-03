/** Client-side tag parsing — mirrors server normalizeTags (lowercase, dedupe). */
export function parseTagsInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const tag = part.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function formatTagsInput(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return tags.join(", ");
}
