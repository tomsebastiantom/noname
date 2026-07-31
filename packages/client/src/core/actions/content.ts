import { emptyValuesForSchema } from "../../admin/components/content/content-entry-utils";
import {
  type ContentEntryRow,
  type ContentTypeSchema,
  createContentEntry,
  deleteContentEntry,
  getContentType,
  listContentTypes,
  listEntries,
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
} from "../../admin/content-entries";
import { fetchAuthSessionStatus, PERMISSIONS, sessionHasPermission } from "../../auth/team-users";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type ContentAdminLoaded =
  | {
      mode: "types";
      loadedAt: number;
      types: { name: string; fieldCount: number }[];
      canPublish: boolean;
    }
  | {
      mode: "entries";
      loadedAt: number;
      contentType: string;
      locale: string;
      schema: ContentTypeSchema | null;
      entries: ContentEntryRow[];
      initialSelectedId: string | null;
      initialValues: Record<string, string>;
      initialStatus: string;
      canPublish: boolean;
    };

export const contentActions = {
  loadContentAdmin: (async (params, setState) => {
    const { contentType = "", locale = "en-US" } = (params ?? {}) as {
      contentType?: string;
      locale?: string;
    };

    setState(ADMIN_STATE.content.loading, true);
    setState(ADMIN_STATE.content.error, null);

    try {
      const session = await fetchAuthSessionStatus().catch(() => null);
      const canPublish = sessionHasPermission(session, PERMISSIONS.CONTENT_PUBLISH);

      if (!contentType) {
        const allTypes = await listContentTypes();
        const loaded: ContentAdminLoaded = {
          mode: "types",
          loadedAt: Date.now(),
          types: allTypes.map((t) => ({ name: t.name, fieldCount: t.schema.fields.length })),
          canPublish,
        };
        setState(ADMIN_STATE.content.loaded, loaded);
        return;
      }

      const typeDef = await getContentType(contentType);
      if (!typeDef) {
        const loaded: ContentAdminLoaded = {
          mode: "entries",
          loadedAt: Date.now(),
          contentType,
          locale,
          schema: null,
          entries: [],
          initialSelectedId: null,
          initialValues: {},
          initialStatus: "draft",
          canPublish,
        };
        setState(ADMIN_STATE.content.loaded, loaded);
        return;
      }

      const rows = await listEntries(contentType);
      const first = rows[0];
      let initialSelectedId: string | null = null;
      let initialValues = emptyValuesForSchema(typeDef.schema);
      let initialStatus = "draft";

      if (first) {
        initialSelectedId = first.id;
        initialStatus = first.status;
        initialValues = await loadEntryFields(contentType, first.id, locale);
      }

      const loaded: ContentAdminLoaded = {
        mode: "entries",
        loadedAt: Date.now(),
        contentType,
        locale,
        schema: typeDef.schema,
        entries: rows,
        initialSelectedId,
        initialValues,
        initialStatus,
        canPublish,
      };
      setState(ADMIN_STATE.content.loaded, loaded);
    } catch (err) {
      setState(ADMIN_STATE.content.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.content.loaded, null);
    } finally {
      setState(ADMIN_STATE.content.loading, false);
    }
  }) satisfies CatalogActionHandler,

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
