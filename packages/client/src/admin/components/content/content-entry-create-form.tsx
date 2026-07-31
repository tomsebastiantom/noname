import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { ContentFieldSchema } from "../../content-entries";
import { ContentEntryFieldInput } from "./content-entry-field-input";
import type { MediaFieldLabels } from "./MediaFieldInput";

export function ContentEntryCreateForm({
  entryCount,
  isNewEntry,
  title,
  description,
  editableFields,
  values,
  locale,
  mediaLabels,
  error,
  success,
  creating,
  createDraftLabel,
  creatingLabel,
  onValuesChange,
  onSubmit,
  onCancel,
}: {
  entryCount: number;
  isNewEntry: boolean;
  title: string;
  description: string;
  editableFields: ContentFieldSchema[];
  values: Record<string, string>;
  locale: string;
  mediaLabels: MediaFieldLabels;
  error: string | null;
  success: string | null;
  creating: boolean;
  createDraftLabel: string;
  creatingLabel: string;
  onValuesChange: (values: Record<string, string>) => void;
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
          <CardTitle>{isNewEntry && entryCount > 0 ? "New entry" : title}</CardTitle>
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
              />
            ))}

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
                {creating ? creatingLabel : createDraftLabel}
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
