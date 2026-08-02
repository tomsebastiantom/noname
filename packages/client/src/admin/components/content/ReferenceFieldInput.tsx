import { type ReactNode, useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import type { ReferenceFieldOptions } from "../../../core/actions/content";
import {
  type ContentEntryRow,
  type ContentTypeSchema,
  documentIdFromFieldValue,
  entryLabel,
  getContentType,
  listEntries,
} from "../../content-entries";

export type ReferenceFieldLabels = {
  entriesLoadingLabel: string;
  emptyLabel: string;
  selectedPrefix: string;
  clearLabel: string;
  missingTargetMessage: string;
};

function entryPickerBody(options: {
  loading: boolean;
  entries: ContentEntryRow[];
  targetContentType: string;
  targetSchema: ContentTypeSchema | null;
  locale: string;
  selectedDocumentId: string | null;
  labels: ReferenceFieldLabels;
  onChange: (value: string) => void;
}): ReactNode {
  if (options.loading) {
    return <p className="text-sm text-muted-foreground">{options.labels.entriesLoadingLabel}</p>;
  }
  if (options.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {options.labels.emptyLabel.replace("{type}", options.targetContentType)}
      </p>
    );
  }
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
      {options.entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => options.onChange(JSON.stringify({ documentId: entry.id }))}
          className={
            options.selectedDocumentId === entry.id
              ? "rounded bg-muted px-2 py-1.5 text-left text-sm font-medium"
              : "rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"
          }
        >
          {options.targetSchema
            ? entryLabel(entry, options.targetSchema, options.locale)
            : entry.id}
          <span className="ml-2 text-xs uppercase">{entry.status}</span>
        </button>
      ))}
    </div>
  );
}

export function ReferenceFieldInput({
  label,
  required,
  targetContentType,
  locale,
  value,
  onChange,
  labels,
  referenceOptions,
}: Readonly<{
  label: string;
  required: boolean;
  targetContentType: string;
  locale: string;
  value: string;
  onChange: (value: string) => void;
  labels: ReferenceFieldLabels;
  referenceOptions?: ReferenceFieldOptions;
}>) {
  const [entries, setEntries] = useState<ContentEntryRow[]>(referenceOptions?.entries ?? []);
  const [targetSchema, setTargetSchema] = useState<ContentTypeSchema | null>(
    referenceOptions?.schema ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocumentId = documentIdFromFieldValue(value);
  const selectedEntry = selectedDocumentId
    ? entries.find((entry) => entry.id === selectedDocumentId)
    : undefined;

  useEffect(() => {
    if (referenceOptions) {
      setEntries(referenceOptions.entries);
      setTargetSchema(referenceOptions.schema);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    if (!targetContentType) return;

    setLoading(true);
    setError(null);
    void Promise.all([listEntries(targetContentType), getContentType(targetContentType)])
      .then(([rows, typeDef]) => {
        if (!cancelled) {
          setEntries(rows);
          setTargetSchema(typeDef?.schema ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetContentType, referenceOptions]);

  if (!targetContentType) {
    return (
      <p className="text-sm text-destructive">
        {labels.missingTargetMessage.replace("{label}", label)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required ? " *" : ""}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          → {targetContentType}
        </span>
      </Label>

      {selectedEntry && targetSchema && (
        <p className="text-sm text-muted-foreground">
          {labels.selectedPrefix} {entryLabel(selectedEntry, targetSchema, locale)}
        </p>
      )}

      {entryPickerBody({
        loading,
        entries,
        targetContentType,
        targetSchema,
        locale,
        selectedDocumentId,
        labels,
        onChange,
      })}

      {selectedDocumentId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange("")}
        >
          {labels.clearLabel}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
