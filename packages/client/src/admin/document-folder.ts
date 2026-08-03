/** Format collection id for folder select (empty string = no folder). */
export function formatCollectionId(collectionId: string | null | undefined): string {
  return collectionId ?? "";
}

/** Parse folder select value — empty clears folder. */
export function parseCollectionId(value: string): string | null {
  const id = value.trim();
  return id.length > 0 ? id : null;
}
