import type { ContentTypeSchema } from "../../content-entries";
import { isEditableField } from "../../content-entries";

export function newEntryCardDescription(
  contentType: string,
  entryCount: number,
  isNewEntry: boolean,
): string {
  if (isNewEntry && entryCount > 0) {
    return `Create a ${contentType} entry`;
  }
  const entryState = entryCount === 0 ? "no entries yet" : "new entry";
  return `Content type ${contentType} — ${entryState}.`;
}

export function emptyValuesForSchema(typeSchema: ContentTypeSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of typeSchema.fields) {
    if (!isEditableField(field.type)) continue;
    out[field.key] = field.type === "boolean" ? "false" : "";
  }
  return out;
}
