export function isPublished(doc: { status: string }): boolean {
  return doc.status === "published";
}
