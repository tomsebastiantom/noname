import type { Spec } from "@json-render/core";
import type { ContentTypeSchema } from "@noname/documents";
import type { CatalogActionHandler } from "../core/actions/types";
import {
  getContentType,
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
} from "../documents/content-entries";
import {
  getLayoutForTemplate,
  parseSpecJson,
  publishLayout,
  saveLayout,
  specToJson,
} from "../documents/layout-entries";

export const editorActionHandlers = {
  loadEditorLayout: (async (params) => {
    const { templateName, segment = "default" } = (params ?? {}) as {
      templateName?: string;
      segment?: string;
    };
    if (!templateName) throw new Error("templateName is required");
    const row = await getLayoutForTemplate(templateName, segment);
    if (!row) throw new Error(`Layout "${templateName}" not found`);
    void row;
  }) satisfies CatalogActionHandler,

  saveEditorLayout: (async (params) => {
    const { id, specJson, contentRef } = (params ?? {}) as {
      id?: string;
      specJson?: string;
      contentRef?: string | null;
    };
    if (!id || !specJson) throw new Error("id and specJson are required");
    const spec = parseSpecJson(specJson);
    await saveLayout({ id, spec, contentRef });
  }) satisfies CatalogActionHandler,

  publishEditorLayout: (async (params) => {
    const { id } = (params ?? {}) as { id?: string };
    if (!id) throw new Error("id is required");
    await publishLayout(id);
  }) satisfies CatalogActionHandler,

  loadEditorContent: (async (params) => {
    const { contentRef, locale } = (params ?? {}) as {
      contentRef?: string;
      locale?: string;
    };
    if (!contentRef) throw new Error("contentRef is required");
    const match = /^([^:]+):(.+)$/.exec(contentRef);
    if (!match?.[1] || !match[2]) throw new Error("Invalid contentRef");
    const contentType = match[1];
    const entryId = match[2];
    const typeDef = await getContentType(contentType);
    if (!typeDef) throw new Error(`Content type "${contentType}" not found`);
    await loadEntryFields(contentType, entryId, locale);
  }) satisfies CatalogActionHandler,

  saveEditorContent: (async (params) => {
    const { contentType, id, schema, values, locale } = (params ?? {}) as {
      contentType?: string;
      id?: string;
      schema?: ContentTypeSchema;
      values?: Record<string, string>;
      locale?: string;
    };
    if (!contentType || !id || !schema || !values) {
      throw new Error("contentType, id, schema, and values are required");
    }
    await saveContentEntry({ contentType, id, schema, values, locale });
  }) satisfies CatalogActionHandler,

  publishEditorContent: (async (params) => {
    const { contentType, id } = (params ?? {}) as { contentType?: string; id?: string };
    if (!contentType || !id) throw new Error("contentType and id are required");
    await publishContentEntry(contentType, id);
  }) satisfies CatalogActionHandler,
} satisfies Record<string, CatalogActionHandler>;

/** Parse layout spec JSON for action handlers and hooks. */
export function layoutSpecFromJson(specJson: string): Spec {
  return parseSpecJson(specJson) as unknown as Spec;
}

export function layoutSpecToJson(spec: Spec): string {
  return specToJson(spec as unknown as Record<string, unknown>);
}
