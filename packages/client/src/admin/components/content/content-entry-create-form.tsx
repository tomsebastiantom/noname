import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { ReferenceFieldOptions } from "../../../core/actions/content";
import type { ContentFieldSchema } from "../../content-entries";
import type { DocumentAccessLabels } from "../shared/DocumentAccessFields";
import { DocumentAccessFields } from "../shared/DocumentAccessFields";
import { ContentEntryFieldInput } from "./content-entry-field-input";
import type { MediaFieldLabels } from "./MediaFieldInput";
import type { ReferenceFieldLabels } from "./ReferenceFieldInput";

export function ContentEntryCreateForm({
  entryCount,
  isNewEntry,
  description,
  editableFields,
  values,
  tagsInput,
  locale,
  mediaLabels,
  referenceLabels,
  referenceOptions,
  error,
  success,
  creating,
  labels,
  onValuesChange,
  onTagsInputChange,
  onSubmit,
  onCancel,
}: {
  entryCount: number;
  isNewEntry: boolean;
  description: string;
  editableFields: ContentFieldSchema[];
  values: Record<string, string>;
  tagsInput: string;
  locale: string;
  mediaLabels: MediaFieldLabels;
  referenceLabels: ReferenceFieldLabels;
  referenceOptions?: Record<string, ReferenceFieldOptions>;
  error: string | null;
  success: string | null;
  creating: boolean;
  labels: DocumentAccessLabels & {
    title: string;
    createDraftLabel: string;
    creatingLabel: string;
  };
  onValuesChange: (values: Record<string, string>) => void;
  onTagsInputChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <a href="/admin/content" className="text-sm text-muted-foreground hover:text-foreground">
        ← All content types
      </a>
      <Card>
        <CardHeader>
          <CardTitle>{isNewEntry && entryCount > 0 ? "New entry" : labels.title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
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
              tagsFieldId="content-create-tags"
              tagsInput={tagsInput}
              onTagsInputChange={onTagsInputChange}
              labels={labels}
            />

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
              <Button type="submit" disabled={creating}>
                {creating ? labels.creatingLabel : labels.createDraftLabel}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
