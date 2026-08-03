import type { ContentTypeSchema } from "@noname/documents";

export type ContentDraftCacheEntry = {
  schema: ContentTypeSchema;
  fields: Record<string, string>;
};

const contentDraftCache = new Map<string, ContentDraftCacheEntry>();

export function contentDraftCacheKey(contentType: string, entryId: string, locale: string): string {
  return `${contentType}:${entryId}:${locale}`;
}

export function getContentDraftCache(key: string): ContentDraftCacheEntry | undefined {
  return contentDraftCache.get(key);
}

export function setContentDraftCache(key: string, entry: ContentDraftCacheEntry): void {
  contentDraftCache.set(key, entry);
}

export function clearContentDraftCache(): void {
  contentDraftCache.clear();
}
