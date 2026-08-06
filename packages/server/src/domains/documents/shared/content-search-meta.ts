import { buildContentSearchText } from "@noname/documents";
import type { ContentTypeSchema } from "../ports";

export function contentSearchMeta(
  schema: ContentTypeSchema,
  data: Record<string, unknown>,
  existingMeta?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existingMeta ?? {}),
    searchText: buildContentSearchText(schema, data),
  };
}
