import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { isEditableField } from "../../content-entries";
import { DocumentAccessFields } from "../shared/DocumentAccessFields";
import { ContentEntryFieldInput } from "./content-entry-field-input";
import { ContentEntryListPanel } from "./content-entry-list-panel";
import type { ContentEntryEditorProps } from "./content-entry-types";

export function ContentEntryEditor(props: ContentEntryEditorProps) {
  const {
    contentType,
    locale,
    status,
    schema,
    entries,
    selectedId,
    values,
    folderInput,
    labels,
    mediaLabels,
    referenceLabels,
    referenceOptions,
    error,
    success,
    saving,
    publishing,
    deleting,
    canPublish,
    canManageAccess,
    onSelectEntry,
    onStartNewEntry,
    onValuesChange,
    onFolderInputChange,
    onSave,
    onPublish,
    onDelete,
  } = props;

  const editableFields = schema.fields.filter((f) => isEditableField(f.type));
  const skippedFields = schema.fields.filter((f) => !isEditableField(f.type));
  const isNewEntry = selectedId === null;
  const busy = saving || publishing || deleting;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <a href="/admin/content" className="text-sm text-muted-foreground hover:text-foreground">
        ← All content types
      </a>

      <div className="flex flex-col gap-6 lg:flex-row">
        <ContentEntryListPanel
          contentType={contentType}
          entries={entries}
          schema={schema}
          locale={locale}
          onSelectEntry={onSelectEntry}
          onStartNewEntry={onStartNewEntry}
        />

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>{labels.title}</CardTitle>
            {labels.description && <CardDescription>{labels.description}</CardDescription>}
            <p className="text-xs text-muted-foreground">
              Type: {contentType} · Locale: {locale} · Status: {status}
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onSave();
              }}
              className="flex flex-col gap-4"
            >
              {editableFields.map((field) => (
                <ContentEntryFieldInput
                  key={field.key}
                  field={field}
                  locale={locale}
                  value={values[field.key] ?? ""}
                  onChange={(v) => onValuesChange({ ...values, [field.key]: v })}
                  mediaLabels={mediaLabels}
                  referenceLabels={referenceLabels}
                  referenceOptions={referenceOptions}
                />
              ))}

              <DocumentAccessFields
                folderFieldId="content-entry-tags"
                folderInput={folderInput}
                onFolderInputChange={onFolderInputChange}
                labels={labels}
                documentId={selectedId ?? undefined}
                showShare={canManageAccess}
              />

              {skippedFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Not editable in this UI yet: {skippedFields.map((f) => f.label).join(", ")}
                </p>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {saving ? labels.savingLabel : labels.saveLabel}
                </Button>
                {canPublish && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onPublish()}
                  >
                    {publishing ? labels.publishingLabel : labels.publishLabel}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || isNewEntry}
                  onClick={() => void onDelete()}
                >
                  {deleting ? labels.deletingLabel : labels.deleteLabel}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
