import { useEffect, useState } from "react";
import {
  type ContentEntryRow,
  entryLabel,
  getContentType,
  listEntries,
} from "../../admin/content-entries";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";

function documentIdFromFieldValue(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const key of ["documentId", "entryId", "assetId"]) {
      const raw = parsed[key];
      if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
    }
  } catch {
    if (value.trim()) return value.trim();
  }
  return null;
}

export function ReferenceFieldInput({
  label,
  required,
  targetContentType,
  locale,
  value,
  onChange,
}: Readonly<{
  label: string;
  required: boolean;
  targetContentType: string;
  locale: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  const [entries, setEntries] = useState<ContentEntryRow[]>([]);
  const [targetSchema, setTargetSchema] =
    useState<Awaited<ReturnType<typeof getContentType>>>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocumentId = documentIdFromFieldValue(value);
  const selectedEntry = selectedDocumentId
    ? entries.find((entry) => entry.id === selectedDocumentId)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!targetContentType) return;

    setLoading(true);
    setError(null);
    void Promise.all([listEntries(targetContentType), getContentType(targetContentType)])
      .then(([rows, typeDef]) => {
        if (!cancelled) {
          setEntries(rows);
          setTargetSchema(typeDef);
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
  }, [targetContentType]);

  if (!targetContentType) {
    return (
      <p className="text-sm text-destructive">
        Reference field &quot;{label}&quot; is missing schema references (target content type).
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
          Selected: {entryLabel(selectedEntry, targetSchema.schema, locale)}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading entries…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {targetContentType} entries yet.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onChange(JSON.stringify({ documentId: entry.id }))}
              className={
                selectedDocumentId === entry.id
                  ? "rounded bg-muted px-2 py-1.5 text-left text-sm font-medium"
                  : "rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"
              }
            >
              {targetSchema ? entryLabel(entry, targetSchema.schema, locale) : entry.id}
              <span className="ml-2 text-xs uppercase">{entry.status}</span>
            </button>
          ))}
        </div>
      )}

      {selectedDocumentId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange("")}
        >
          Clear
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
