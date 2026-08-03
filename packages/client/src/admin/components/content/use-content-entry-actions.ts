import type { ContentTypeSchema } from "@noname/documents";
import type { CatalogSubmit } from "../../../core/use-catalog-submit";
import {
  type ContentEntryRow,
  fetchRefBackrefs,
  listEntries,
  loadEntryFields,
} from "../../content-entries";
import { formatCollectionId, parseCollectionId } from "../../document-folder";

export function useContentEntryAdminActions(options: {
  catalog: CatalogSubmit;
  contentType: string;
  locale: string;
  schema: ContentTypeSchema | null;
  values: Record<string, string>;
  folderInput: string;
  selectedId: string | null;
  localEntries: ContentEntryRow[];
  messages: {
    entryCreatedMessage: string;
    entrySavedMessage: string;
    entryPublishedMessage: string;
    entryDeletedMessage: string;
    deleteConfirmMessage: string;
  };
  setCreating: (value: boolean) => void;
  setSaving: (value: boolean) => void;
  setPublishing: (value: boolean) => void;
  setDeleting: (value: boolean) => void;
  setSelectedId: (value: string | null) => void;
  setStatus: (value: string) => void;
  setLocalEntries: (rows: ContentEntryRow[]) => void;
  setValues: (values: Record<string, string>) => void;
  setFolderInput: (value: string) => void;
  reloadContent: () => Promise<void>;
}) {
  const {
    catalog,
    contentType,
    locale,
    schema,
    values,
    folderInput,
    selectedId,
    localEntries,
    messages,
    setCreating,
    setSaving,
    setPublishing,
    setDeleting,
    setSelectedId,
    setStatus,
    setLocalEntries,
    setValues,
    setFolderInput,
    reloadContent,
  } = options;

  const { submit, run, reset, setError, executeAction } = catalog;

  async function selectEntry(id: string) {
    if (!schema || !contentType) return;
    reset();
    setSelectedId(id);
    const row = localEntries.find((e) => e.id === id);
    setStatus(row?.status ?? "draft");
    try {
      setValues(await loadEntryFields(contentType, id, locale));
      setFolderInput(formatCollectionId(row?.collectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onCreate() {
    if (!schema || !contentType) return;

    await submit({
      action: "createContentEntry",
      params: { contentType, schema, values, locale, collectionId: parseCollectionId(folderInput) },
      successMessage: messages.entryCreatedMessage,
      onPendingChange: setCreating,
      onSuccess: async () => {
        const previousIds = new Set(localEntries.map((row) => row.id));
        const rows = await listEntries(contentType);
        setLocalEntries(rows);
        const created = rows.find((row) => !previousIds.has(row.id));
        if (created) setSelectedId(created.id);
        setStatus("draft");
      },
    });
  }

  async function onSave() {
    if (!selectedId || !schema || !contentType) return;

    await submit({
      action: "saveContentEntry",
      params: {
        contentType,
        id: selectedId,
        schema,
        values,
        locale,
        collectionId: parseCollectionId(folderInput),
      },
      successMessage: messages.entrySavedMessage,
      onPendingChange: setSaving,
      onSuccess: async () => {
        setStatus("draft");
        setLocalEntries(await listEntries(contentType));
      },
    });
  }

  async function onPublish() {
    if (!selectedId || !schema || !contentType) return;

    await run(
      async () => {
        await executeAction("saveContentEntry", {
          contentType,
          id: selectedId,
          schema,
          values,
          locale,
          collectionId: parseCollectionId(folderInput),
        });
        await executeAction("publishContentEntry", { contentType, id: selectedId });
      },
      {
        successMessage: messages.entryPublishedMessage,
        onPendingChange: setPublishing,
        onSuccess: async () => {
          setStatus("published");
          setLocalEntries(await listEntries(contentType));
        },
      },
    );
  }

  async function onDelete() {
    if (!selectedId || !contentType) return;

    await run(
      async () => {
        const backrefs = await fetchRefBackrefs(selectedId);
        let message = messages.deleteConfirmMessage;
        if (backrefs.length > 0) {
          const lines = backrefs
            .slice(0, 8)
            .map((hit) => `• ${hit.type}/${hit.key} (${hit.fieldPath})`)
            .join("\n");
          const more = backrefs.length > 8 ? `\n…and ${backrefs.length - 8} more` : "";
          message += `\n\n${backrefs.length} document(s) still reference it:\n${lines}${more}`;
        }
        if (!window.confirm(message)) return;

        await executeAction("deleteContentEntry", { contentType, id: selectedId });
        await reloadContent();
      },
      {
        successMessage: messages.entryDeletedMessage,
        onPendingChange: setDeleting,
      },
    );
  }

  return { selectEntry, onCreate, onSave, onPublish, onDelete };
}
