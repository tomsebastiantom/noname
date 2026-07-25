import {
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
  type ContentTypeSchema,
} from "../../admin/content-entries";

export const contentActions = {
  saveContentEntry: async (params: unknown) => {
    const { contentType, id, schema, values, locale } = params as {
      contentType: string;
      id: string;
      schema: ContentTypeSchema;
      values: Record<string, string>;
      locale?: string;
    };
    await saveContentEntry({ contentType, id, schema, values, locale });
  },

  publishContentEntry: async (params: unknown) => {
    const { contentType, id } = params as { contentType: string; id: string };
    await publishContentEntry(contentType, id);
  },
};
