import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { ContentEntryRow, ContentTypeSchema } from "../../content-entries";
import { entryLabel, isEditableField } from "../../content-entries";
import { DataTable } from "../shared/DataTable";
import { ContentEntryFieldInput } from "./content-entry-field-input";
import type { MediaFieldLabels } from "./MediaFieldInput";

export function ContentEntryEditor({
  contentType,
  locale,
  status,
  schema,
  entries,
  selectedId,
  values,
  mediaLabels,
  error,
  success,
  saving,
  publishing,
  deleting,
  canPublish,
  labels,
  onSelectEntry,
  onStartNewEntry,
  onValuesChange,
  onSave,
  onPublish,
  onDelete,
}: {
  contentType: string;
  locale: string;
  status: string;
  schema: ContentTypeSchema;
  entries: ContentEntryRow[];
  selectedId: string | null;
  values: Record<string, string>;
  mediaLabels: MediaFieldLabels;
  error: string | null;
  success: string | null;
  saving: boolean;
  publishing: boolean;
  deleting: boolean;
  canPublish: boolean;
  labels: {
    title: string;
    description: string | null;
    saveLabel: string;
    savingLabel: string;
    publishLabel: string;
    publishingLabel: string;
    deleteLabel: string;
    deletingLabel: string;
  };
  onSelectEntry: (id: string) => void;
  onStartNewEntry: () => void;
  onValuesChange: (values: Record<string, string>) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const editableFields = schema.fields.filter((f) => isEditableField(f.type));
  const skippedFields = schema.fields.filter((f) => !isEditableField(f.type));
  const isNewEntry = selectedId === null;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <a href="/admin/content" className="text-sm text-muted-foreground hover:text-foreground">
        ← All content types
      </a>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="shrink-0 lg:w-64">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">{contentType}</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={onStartNewEntry}>
              + New
            </Button>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <DataTable
              rows={entries}
              rowKey={(entry) => entry.id}
              onRowClick={(entry) => onSelectEntry(entry.id)}
              emptyMessage="No entries yet."
              columns={[
                {
                  key: "label",
                  header: "Entry",
                  cell: (entry) => entryLabel(entry, schema, locale),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (entry) => (
                    <Badge variant={entry.status === "published" ? "success" : "muted"}>
                      {entry.status}
                    </Badge>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

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
                />
              ))}

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
                <Button type="submit" disabled={saving || publishing || deleting}>
                  {saving ? labels.savingLabel : labels.saveLabel}
                </Button>
                {canPublish && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || publishing || deleting}
                    onClick={() => void onPublish()}
                  >
                    {publishing ? labels.publishingLabel : labels.publishLabel}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving || publishing || deleting || isNewEntry}
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
