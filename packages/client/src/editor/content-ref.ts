export type ParsedContentRef = {
  contentType: string;
  entryId: string;
};

/** Parse `product:uuid` into content type + document id. */
export function parseContentRef(contentRef: string): ParsedContentRef | null {
  const trimmed = contentRef.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) return null;
  const contentType = trimmed.slice(0, colon);
  const entryId = trimmed.slice(colon + 1);
  if (!contentType || !entryId) return null;
  return { contentType, entryId };
}
