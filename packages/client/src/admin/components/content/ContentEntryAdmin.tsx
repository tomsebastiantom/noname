import { useStateValue } from "@json-render/react";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { ContentAdminLoaded } from "../../../core/actions/content";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import {
  CONTENT_DEFAULT_LOCALE,
  type ContentEntryRow,
  contentTypeFromPath,
  isEditableField,
} from "../../content-entries";
import { ContentEntryCreateForm } from "./content-entry-create-form";
import { ContentEntryEditor } from "./content-entry-editor";
import { ContentEntryTypeList } from "./content-entry-type-list";
import { emptyValuesForSchema, newEntryCardDescription } from "./content-entry-utils";
import type { MediaFieldLabels } from "./MediaFieldInput";
import { useContentEntryAdminActions } from "./use-content-entry-actions";

type ContentEntryAdminProps = ComponentCtx<{
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
}>;

type EntriesLoaded = Extract<ContentAdminLoaded, { mode: "entries" }>;

function ContentEntryEntriesPanel({
  loaded,
  props,
  loadParams,
  loadError,
}: {
  loaded: EntriesLoaded;
  props: ContentEntryAdminProps["props"];
  loadParams: { contentType: string; locale: string };
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const contentType = loaded.contentType;
  const locale = loaded.locale;
  const schema = loaded.schema;

  const mediaLabels: MediaFieldLabels = {
    uploadFileLabel: props.uploadFileLabel,
    uploadingLabel: props.uploadingLabel,
    pickExistingLabel: props.pickExistingLabel,
    loadingAssetsLabel: props.loadingAssetsLabel,
    clearLabel: props.clearLabel,
  };

  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(loaded.initialSelectedId);
  const [values, setValues] = useState<Record<string, string>>(loaded.initialValues);
  const [status, setStatus] = useState(loaded.initialStatus);
  const [localEntries, setLocalEntries] = useState<ContentEntryRow[]>(loaded.entries);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function reloadContent() {
    await catalog.executeAction("loadContentAdmin", loadParams);
  }

  function startNewEntry() {
    if (!schema) return;
    setSelectedId(null);
    setValues(emptyValuesForSchema(schema));
    setStatus("draft");
    catalog.reset();
  }

  const { selectEntry, onCreate, onSave, onPublish, onDelete } = useContentEntryAdminActions({
    catalog,
    contentType,
    locale,
    schema,
    values,
    selectedId,
    localEntries,
    messages: {
      entryCreatedMessage: props.entryCreatedMessage,
      entrySavedMessage: props.entrySavedMessage,
      entryPublishedMessage: props.entryPublishedMessage,
      entryDeletedMessage: props.entryDeletedMessage,
      deleteConfirmMessage: props.deleteConfirmMessage,
    },
    setCreating,
    setSaving,
    setPublishing,
    setDeleting,
    setSelectedId,
    setStatus,
    setLocalEntries,
    setValues,
    reloadContent,
  });

  const displayError = mergeCatalogError(catalog.error, loadError);
  const editableFields = schema!.fields.filter((f) => isEditableField(f.type));
  const isNewEntry = selectedId === null;

  if (localEntries.length === 0 || isNewEntry) {
    return (
      <ContentEntryCreateForm
        entryCount={localEntries.length}
        isNewEntry={isNewEntry}
        title={props.title}
        description={newEntryCardDescription(contentType, localEntries.length, isNewEntry)}
        editableFields={editableFields}
        values={values}
        locale={locale}
        mediaLabels={mediaLabels}
        error={displayError}
        success={catalog.success}
        creating={creating}
        createDraftLabel={props.createDraftLabel}
        creatingLabel={props.creatingLabel}
        onValuesChange={setValues}
        onSubmit={() => void onCreate()}
        onCancel={
          isNewEntry && localEntries.length > 0
            ? () => void selectEntry(localEntries[0]!.id)
            : undefined
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
      schema={schema!}
      entries={localEntries}
      selectedId={selectedId}
      values={values}
      mediaLabels={mediaLabels}
      error={displayError}
      success={catalog.success}
      saving={saving}
      publishing={publishing}
      deleting={deleting}
      canPublish={loaded.canPublish}
      saveLabel={props.saveLabel}
      savingLabel={props.savingLabel}
      publishLabel={props.publishLabel}
      publishingLabel={props.publishingLabel}
      deleteLabel={props.deleteLabel}
      deletingLabel={props.deletingLabel}
      onSelectEntry={(id) => void selectEntry(id)}
      onStartNewEntry={startNewEntry}
      onValuesChange={setValues}
      onSave={() => void onSave()}
      onPublish={() => void onPublish()}
      onDelete={() => void onDelete()}
    />
  );
}

export function ContentEntryAdmin({ props }: ContentEntryAdminProps) {
  const locale = props.locale || CONTENT_DEFAULT_LOCALE;
  const contentType = contentTypeFromPath(window.location.pathname);
  const loadParams = useMemo(() => ({ contentType, locale }), [contentType, locale]);
  useMountAction("loadContentAdmin", loadParams);

  const loaded = useStateValue(ADMIN_STATE.content.loaded) as ContentAdminLoaded | null | undefined;
  const loading = (useStateValue(ADMIN_STATE.content.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.content.error) as string | null | undefined;

  const types = loaded?.mode === "types" ? loaded.types : [];
  const schema = loaded?.mode === "entries" ? (loaded.schema ?? null) : null;

  if (loading) {
    return <p className="text-muted-foreground">{props.loadingLabel}</p>;
  }

  if (!contentType) {
    return (
      <ContentEntryTypeList
        title={props.title}
        description={props.description}
        types={types}
        error={loadError}
      />
    );
  }

  if (!schema || loaded?.mode !== "entries") {
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

  return (
    <ContentEntryEntriesPanel
      key={loaded.loadedAt}
      loaded={loaded}
      props={props}
      loadParams={loadParams}
      loadError={loadError}
    />
  );
}
