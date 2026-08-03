import { emptyValuesForSchema } from "../../admin/components/content/content-entry-utils";
import { formatCollectionId } from "../../admin/document-folder";
import type { FolderCatalogEntry } from "../../admin/folder-tree";
import { fetchScopeCollections } from "../../auth/document-scope";
import { fetchAuthSessionStatus, PERMISSIONS, sessionHasPermission } from "../../auth/team-users";
import {
  type AssetSummary,
  type ContentEntryRow,
  type ContentTypeSchema,
  createContentEntry,
  deleteContentEntry,
  getContentType,
  listAssets,
  listContentTypes,
  listEntries,
  loadEntryFields,
  publishContentEntry,
  saveContentEntry,
} from "../../documents/content-entries";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type ReferenceFieldOptions = {
  entries: ContentEntryRow[];
  schema: ContentTypeSchema | null;
};

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
      folders: FolderCatalogEntry[];
      initialSelectedId: string | null;
      initialValues: Record<string, string>;
      initialFolderInput: string;
      initialStatus: string;
      canPublish: boolean;
      canManageAccess: boolean;
      referenceOptions: Record<string, ReferenceFieldOptions>;
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
      const canManageAccess = sessionHasPermission(session, PERMISSIONS.SCOPE_MANAGE);

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
          folders: [],
          initialSelectedId: null,
          initialValues: {},
          initialFolderInput: "",
          initialStatus: "draft",
          canPublish,
          canManageAccess,
          referenceOptions: {},
        };
        setState(ADMIN_STATE.content.loaded, loaded);
        return;
      }

      const [rows, folderRows] = await Promise.all([
        listEntries(contentType),
        fetchScopeCollections().catch(() => []),
      ]);
      const folders: FolderCatalogEntry[] = folderRows
        .filter((entry): entry is typeof entry & { id: string } => Boolean(entry.id))
        .map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          label: entry.label,
          parentId: entry.parentId ?? null,
        }));
      const referenceTypes = [
        ...new Set(
          typeDef.schema.fields
            .filter((field) => field.type === "reference" && field.references)
            .map((field) => field.references as string),
        ),
      ];
      const referenceOptions: Record<string, ReferenceFieldOptions> = {};
      await Promise.all(
        referenceTypes.map(async (refType) => {
          const [refRows, refTypeDef] = await Promise.all([
            listEntries(refType),
            getContentType(refType),
          ]);
          referenceOptions[refType] = {
            entries: refRows,
            schema: refTypeDef?.schema ?? null,
          };
        }),
      );

      const first = rows[0];
      let initialSelectedId: string | null = null;
      let initialValues = emptyValuesForSchema(typeDef.schema);
      let initialFolderInput = "";
      let initialStatus = "draft";

      if (first) {
        initialSelectedId = first.id;
        initialStatus = first.status;
        initialFolderInput = formatCollectionId(first.collectionId);
        initialValues = await loadEntryFields(contentType, first.id, locale);
      }

      const loaded: ContentAdminLoaded = {
        mode: "entries",
        loadedAt: Date.now(),
        contentType,
        locale,
        schema: typeDef.schema,
        entries: rows,
        folders,
        initialSelectedId,
        initialValues,
        initialFolderInput,
        initialStatus,
        canPublish,
        canManageAccess,
        referenceOptions,
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
    const { contentType, id, schema, values, locale, collectionId } = params as {
      contentType: string;
      id: string;
      schema: ContentTypeSchema;
      values: Record<string, string>;
      locale?: string;
      collectionId?: string | null;
    };
    await saveContentEntry({ contentType, id, schema, values, locale, collectionId });
  }) satisfies CatalogActionHandler,

  publishContentEntry: (async (params) => {
    const { contentType, id } = params as { contentType: string; id: string };
    await publishContentEntry(contentType, id);
  }) satisfies CatalogActionHandler,

  createContentEntry: (async (params) => {
    const { contentType, schema, values, locale, collectionId } = params as {
      contentType: string;
      schema: ContentTypeSchema;
      values: Record<string, string>;
      locale?: string;
      collectionId?: string | null;
    };
    await createContentEntry({ contentType, schema, values, locale, collectionId });
  }) satisfies CatalogActionHandler,

  deleteContentEntry: (async (params) => {
    const { contentType, id } = params as { contentType: string; id: string };
    await deleteContentEntry(contentType, id);
  }) satisfies CatalogActionHandler,

  loadMediaAssets: (async (_params, setState) => {
    setState(ADMIN_STATE.content.mediaAssetsLoading, true);
    try {
      const assets = await listAssets();
      setState(ADMIN_STATE.content.mediaAssets, assets);
    } catch (err) {
      setState(ADMIN_STATE.content.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.content.mediaAssets, [] as AssetSummary[]);
    } finally {
      setState(ADMIN_STATE.content.mediaAssetsLoading, false);
    }
  }) satisfies CatalogActionHandler,
};
