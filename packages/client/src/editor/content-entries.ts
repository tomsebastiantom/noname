/** CMS entry API used by the visual editor (same backend as admin content panels). */

export type { ContentFieldSchema, ContentTypeSchema } from "@noname/documents";
export {
  CONTENT_DEFAULT_LOCALE,
  getContentType,
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
} from "../admin/content-entries";
