import { useActions } from "@json-render/react";
import { type FormEvent, useEffect, useState } from "react";
import { fetchAuthSessionStatus, sessionHasPermission } from "../../auth/team-users";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { ComponentCtx } from "../../core/components/types";
import {
  CONTENT_DEFAULT_LOCALE,
  type ContentEntryRow,
  type ContentTypeSchema,
  contentTypeFromPath,
  createContentEntry,
  deleteContentEntry,
  fetchRefBackrefs,
  getContentType,
  isEditableField,
  listContentTypes,
  listEntries,
  loadEntryFields,
} from "../content-entries";
import { ContentEntryCreateForm } from "./content-entry-create-form";
import { ContentEntryEditor } from "./content-entry-editor";
import { ContentEntryTypeList } from "./content-entry-type-list";
import { emptyValuesForSchema, newEntryCardDescription } from "./content-entry-utils";
import type { MediaFieldLabels } from "./MediaFieldInput";

export function ContentEntryAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  locale: string;
  saveLabel: string;
  savingLabel: string;
  publishLabel: string;
  publishingLabel: string;
  deleteLabel: string;
  deletingLabel: string;
  createDraftLabel: string;
  creatingLabel: string;
  loadingLabel: string;
  entryCreatedMessage: string;
  entrySavedMessage: string;
  entryPublishedMessage: string;
  entryDeletedMessage: string;
  deleteConfirmMessage: string;
  uploadFileLabel: string;
  uploadingLabel: string;
  pickExistingLabel: string;
  loadingAssetsLabel: string;
  clearLabel: string;
}>) {
  const { execute } = useActions();
  const locale = props.locale || CONTENT_DEFAULT_LOCALE;
  const mediaLabels: MediaFieldLabels = {
    uploadFileLabel: props.uploadFileLabel,
    uploadingLabel: props.uploadingLabel,
    pickExistingLabel: props.pickExistingLabel,
    loadingAssetsLabel: props.loadingAssetsLabel,
    clearLabel: props.clearLabel,
  };
  const contentType = contentTypeFromPath(window.location.pathname);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [types, setTypes] = useState<{ name: string; fieldCount: number }[]>([]);
  const [schema, setSchema] = useState<ContentTypeSchema | null>(null);
  const [entries, setEntries] = useState<ContentEntryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("draft");
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    void fetchAuthSessionStatus()
      .then((session) => setCanPublish(sessionHasPermission(session, "content:publish")))
      .catch(() => setCanPublish(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!contentType) {
          const allTypes = await listContentTypes();
          if (!cancelled) {
            setTypes(allTypes.map((t) => ({ name: t.name, fieldCount: t.schema.fields.length })));
          }
          return;
        }

        const typeDef = await getContentType(contentType);
        if (!typeDef) throw new Error(`Content type "${contentType}" not found`);

        const rows = await listEntries(contentType);
        if (cancelled) return;

        setSchema(typeDef.schema);
        setEntries(rows);

        const first = rows[0];
        if (first) {
          setSelectedId(first.id);
          setStatus(first.status);
          setValues(await loadEntryFields(contentType, first.id, locale));
        } else {
          setSelectedId(null);
          setValues(emptyValuesForSchema(typeDef.schema));
          setStatus("draft");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [contentType, locale]);

  async function selectEntry(id: string) {
    if (!schema || !contentType) return;
    setError(null);
    setSuccess(null);
    setSelectedId(id);
    const row = entries.find((e) => e.id === id);
    setStatus(row?.status ?? "draft");
    try {
      setValues(await loadEntryFields(contentType, id, locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startNewEntry() {
    if (!schema) return;
    setSelectedId(null);
    setValues(emptyValuesForSchema(schema));
    setStatus("draft");
    setError(null);
    setSuccess(null);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!schema || !contentType) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const id = await createContentEntry({ contentType, schema, values, locale });
      const rows = await listEntries(contentType);
      setEntries(rows);
      setSelectedId(id);
      setStatus("draft");
      setSuccess(props.entryCreatedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId || !schema || !contentType) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await execute({
        action: "saveContentEntry",
        params: { contentType, id: selectedId, schema, values, locale },
      });
      setStatus("draft");
      setSuccess(props.entrySavedMessage);
      setEntries(await listEntries(contentType));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    if (!selectedId || !schema || !contentType) return;

    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      await execute({
        action: "saveContentEntry",
        params: { contentType, id: selectedId, schema, values, locale },
      });
      await execute({ action: "publishContentEntry", params: { contentType, id: selectedId } });
      setStatus("published");
      setSuccess(props.entryPublishedMessage);
      setEntries(await listEntries(contentType));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function onDelete() {
    if (!selectedId || !contentType) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const backrefs = await fetchRefBackrefs(selectedId);
      let message = props.deleteConfirmMessage;
      if (backrefs.length > 0) {
        const lines = backrefs
          .slice(0, 8)
          .map((hit) => `• ${hit.type}/${hit.key} (${hit.fieldPath})`)
          .join("\n");
        const more = backrefs.length > 8 ? `\n…and ${backrefs.length - 8} more` : "";
        message += `\n\n${backrefs.length} document(s) still reference it:\n${lines}${more}`;
      }
      if (!window.confirm(message)) {
        return;
      }

      await deleteContentEntry(contentType, selectedId);
      const rows = await listEntries(contentType);
      setEntries(rows);
      if (rows[0]) {
        await selectEntry(rows[0].id);
      } else {
        setSelectedId(null);
        if (schema) setValues(emptyValuesForSchema(schema));
      }
      setSuccess(props.entryDeletedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{props.loadingLabel}</p>;
  }

  if (!contentType) {
    return (
      <ContentEntryTypeList title={props.title} description={props.description} types={types} />
    );
  }

  if (!schema) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>
            Content type <strong>{contentType}</strong> not found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/admin/content"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            ← All content types
          </a>
        </CardContent>
      </Card>
    );
  }

  const editableFields = schema.fields.filter((f) => isEditableField(f.type));
  const isNewEntry = selectedId === null;

  if (entries.length === 0 || isNewEntry) {
    return (
      <ContentEntryCreateForm
        entryCount={entries.length}
        isNewEntry={isNewEntry}
        title={props.title}
        description={newEntryCardDescription(contentType, entries.length, isNewEntry)}
        editableFields={editableFields}
        values={values}
        locale={locale}
        mediaLabels={mediaLabels}
        error={error}
        success={success}
        creating={creating}
        createDraftLabel={props.createDraftLabel}
        creatingLabel={props.creatingLabel}
        onValuesChange={setValues}
        onSubmit={onCreate}
        onCancel={
          isNewEntry && entries.length > 0 ? () => void selectEntry(entries[0]!.id) : undefined
        }
      />
    );
  }

  return (
    <ContentEntryEditor
      contentType={contentType}
      title={props.title}
      description={props.description}
      locale={locale}
      status={status}
      schema={schema}
      entries={entries}
      selectedId={selectedId}
      values={values}
      mediaLabels={mediaLabels}
      error={error}
      success={success}
      saving={saving}
      publishing={publishing}
      deleting={deleting}
      canPublish={canPublish}
      saveLabel={props.saveLabel}
      savingLabel={props.savingLabel}
      publishLabel={props.publishLabel}
      publishingLabel={props.publishingLabel}
      deleteLabel={props.deleteLabel}
      deletingLabel={props.deletingLabel}
      onSelectEntry={(id) => void selectEntry(id)}
      onStartNewEntry={startNewEntry}
      onValuesChange={setValues}
      onSave={onSave}
      onPublish={() => void onPublish()}
      onDelete={() => void onDelete()}
    />
  );
}
