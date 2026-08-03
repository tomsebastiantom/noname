import type { Spec } from "@json-render/core";
import type { LayoutDraft } from "../lib/types";

export type LayoutDraftCacheEntry = {
  draft: LayoutDraft;
  storedSpec: Spec;
  canPublish: boolean;
};

const layoutDraftCache = new Map<string, LayoutDraftCacheEntry>();

export function layoutDraftCacheKey(templateName: string, segment: string): string {
  return `${segment}:${templateName}`;
}

export function getLayoutDraftCache(
  templateName: string,
  segment: string,
): LayoutDraftCacheEntry | undefined {
  return layoutDraftCache.get(layoutDraftCacheKey(templateName, segment));
}

export function setLayoutDraftCache(
  templateName: string,
  segment: string,
  entry: LayoutDraftCacheEntry,
): void {
  layoutDraftCache.set(layoutDraftCacheKey(templateName, segment), entry);
}

export function clearLayoutDraftCache(): void {
  layoutDraftCache.clear();
}
