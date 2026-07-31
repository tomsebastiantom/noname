import {
  type ContentTypeSchema,
  createContentEntry,
  deleteContentEntry,
  publishContentEntry,
  saveContentEntry,
} from "../../admin/content-entries";
import type { CatalogActionHandler } from "./types";

export const contentActions = {
  saveContentEntry: (async (params) => {
    const { contentType, id, schema, values, locale } = params as {
      contentType: string;
      id: string;
      schema: ContentTypeSchema;
      values: Record<string, string>;
      locale?: string;
    };
    await saveContentEntry({ contentType, id, schema, values, locale });
  }) satisfies CatalogActionHandler,

  publishContentEntry: (async (params) => {
    const { contentType, id } = params as { contentType: string; id: string };
    await publishContentEntry(contentType, id);
  }) satisfies CatalogActionHandler,

  createContentEntry: (async (params) => {
    const { contentType, schema, values, locale } = params as {
      contentType: string;
      schema: ContentTypeSchema;
      values: Record<string, string>;
      locale?: string;
    };
    await createContentEntry({ contentType, schema, values, locale });
  }) satisfies CatalogActionHandler,

  deleteContentEntry: (async (params) => {
    const { contentType, id } = params as { contentType: string; id: string };
    await deleteContentEntry(contentType, id);
  }) satisfies CatalogActionHandler,
};
