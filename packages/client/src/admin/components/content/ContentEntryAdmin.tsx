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
import type { CatalogProps } from "../../../schemas/shared";
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
import type { ReferenceFieldLabels } from "./ReferenceFieldInput";
import { useContentEntryAdminActions } from "./use-content-entry-actions";

type ContentEntryConfig = {
  locale: string;
};

type ContentEntryLabels = {
  title: string;
  description: string | null;
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
  entriesLoadingLabel: string;
  emptyLabel: string;
  selectedPrefix: string;
  missingTargetMessage: string;
};

type ContentEntryAdminProps = ComponentCtx<CatalogProps<ContentEntryConfig, ContentEntryLabels>>;

type EntriesLoaded = Extract<ContentAdminLoaded, { mode: "entries" }>;

function mediaLabelsFrom(labels: ContentEntryLabels): MediaFieldLabels {
  return {
    uploadFileLabel: labels.uploadFileLabel,
    uploadingLabel: labels.uploadingLabel,
    pickExistingLabel: labels.pickExistingLabel,
    loadingAssetsLabel: labels.loadingAssetsLabel,
    clearLabel: labels.clearLabel,
  };
}

function referenceLabelsFrom(labels: ContentEntryLabels): ReferenceFieldLabels {
  return {
    entriesLoadingLabel: labels.entriesLoadingLabel,
    emptyLabel: labels.emptyLabel,
    selectedPrefix: labels.selectedPrefix,
    clearLabel: labels.clearLabel,
    missingTargetMessage: labels.missingTargetMessage,
  };
}

function ContentEntryEntriesPanel({
  loaded,
  labels,
  loadParams,
  loadError,
}: {
  loaded: EntriesLoaded;
  labels: ContentEntryLabels;
  loadParams: { contentType: string; locale: string };
  loadError: string | null | undefined;
}) {
  const catalog = useCatalogSubmit();
  const contentType = loaded.contentType;
  const locale = loaded.locale;
  const schema = loaded.schema;

  const mediaLabels = mediaLabelsFrom(labels);
  const referenceLabels = referenceLabelsFrom(labels);
  const referenceOptions = loaded.referenceOptions;

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
      entryCreatedMessage: labels.entryCreatedMessage,
      entrySavedMessage: labels.entrySavedMessage,
      entryPublishedMessage: labels.entryPublishedMessage,
      entryDeletedMessage: labels.entryDeletedMessage,
      deleteConfirmMessage: labels.deleteConfirmMessage,
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
        description={newEntryCardDescription(contentType, localEntries.length, isNewEntry)}
        editableFields={editableFields}
        values={values}
        locale={locale}
        mediaLabels={mediaLabels}
        referenceLabels={referenceLabels}
        referenceOptions={referenceOptions}
        error={displayError}
        success={catalog.success}
        creating={creating}
        labels={labels}
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
      locale={locale}
      status={status}
      schema={schema!}
      entries={localEntries}
      selectedId={selectedId}
      values={values}
      mediaLabels={mediaLabels}
      referenceLabels={referenceLabels}
      referenceOptions={referenceOptions}
      error={displayError}
      success={catalog.success}
      saving={saving}
      publishing={publishing}
      deleting={deleting}
      canPublish={loaded.canPublish}
      labels={labels}
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
  const { config, labels } = props;
  const locale = config.locale || CONTENT_DEFAULT_LOCALE;
  const contentType = contentTypeFromPath(window.location.pathname);
  const loadParams = useMemo(() => ({ contentType, locale }), [contentType, locale]);
  useMountAction("loadContentAdmin", loadParams);

  const loaded = useStateValue(ADMIN_STATE.content.loaded) as ContentAdminLoaded | null | undefined;
  const loading = (useStateValue(ADMIN_STATE.content.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.content.error) as string | null | undefined;

  const types = loaded?.mode === "types" ? loaded.types : [];
  const schema = loaded?.mode === "entries" ? (loaded.schema ?? null) : null;

  if (loading) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (!contentType) {
    return <ContentEntryTypeList labels={labels} types={types} error={loadError} />;
  }

  if (!schema || loaded?.mode !== "entries") {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
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
      labels={labels}
      loadParams={loadParams}
      loadError={loadError}
    />
  );
}
