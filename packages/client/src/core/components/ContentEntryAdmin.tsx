import { type FormEvent, useEffect, useState } from "react";
import {
  CONTENT_DEFAULT_LOCALE,
  type ContentEntryRow,
  type ContentFieldSchema,
  type ContentTypeSchema,
  contentTypeFromPath,
  createContentEntry,
  entryLabel,
  getContentType,
  isEditableField,
  listContentTypes,
  listEntries,
  loadEntryFields,
} from "../../admin/content-entries";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { executeAction } from "../../platform/registry";
import { MediaFieldInput } from "./MediaFieldInput";
import { ReferenceFieldInput } from "./ReferenceFieldInput";
import type { ComponentCtx } from "./types";

function emptyValuesForSchema(typeSchema: ContentTypeSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of typeSchema.fields) {
    if (!isEditableField(field.type)) continue;
    out[field.key] = field.type === "boolean" ? "false" : "";
  }
  return out;
}

function FieldInput({
  field,
  value,
  onChange,
  locale,
}: {
  field: ContentFieldSchema;
  value: string;
  onChange: (value: string) => void;
  locale: string;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="size-4 rounded border-input"
        />
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }

  if (field.type === "media") {
    return (
      <MediaFieldInput
        label={field.label}
        required={field.required}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "reference") {
    return (
      <ReferenceFieldInput
        label={field.label}
        required={field.required}
        targetContentType={field.references ?? ""}
        locale={locale}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "longText") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field.key}>
          {field.label}
          {field.required ? " *" : ""}
          {field.isLocalizable ? " (localized)" : ""}
        </Label>
        <textarea
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          required={field.required}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required ? " *" : ""}
        {field.isLocalizable ? " (localized)" : ""}
      </Label>
      <Input
        id={field.key}
        type={field.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    </div>
  );
}

export function ContentEntryAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  locale: string;
}>) {
  const locale = props.locale || CONTENT_DEFAULT_LOCALE;
  const contentType = contentTypeFromPath(window.location.pathname);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [types, setTypes] = useState<{ name: string; fieldCount: number }[]>([]);
  const [schema, setSchema] = useState<ContentTypeSchema | null>(null);
  const [entries, setEntries] = useState<ContentEntryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("draft");

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
      setSuccess("Entry created as draft.");
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
      await executeAction(
        "saveContentEntry",
        { contentType, id: selectedId, schema, values, locale },
        () => {},
      );
      setStatus("draft");
      setSuccess("Entry saved as draft.");
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
      await executeAction(
        "saveContentEntry",
        { contentType, id: selectedId, schema, values, locale },
        () => {},
      );
      await executeAction("publishContentEntry", { contentType, id: selectedId }, () => {});
      setStatus("published");
      setSuccess("Entry published.");
      setEntries(await listEntries(contentType));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading content…</p>;
  }

  if (!contentType) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No content types yet. Register one via{" "}
              <code className="rounded bg-muted px-1">POST /api/documents/content-types</code>.
            </p>
          ) : (
            types.map((t) => (
              <a
                key={t.name}
                href={`/admin/content/${t.name}`}
                className="rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted/60"
              >
                {t.name}
                <span className="ml-2 text-xs text-muted-foreground">{t.fieldCount} fields</span>
              </a>
            ))
          )}
        </CardContent>
      </Card>
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
  const skippedFields = schema.fields.filter((f) => !isEditableField(f.type));
  const isNewEntry = selectedId === null;

  if (entries.length === 0 || isNewEntry) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <a href="/admin/content" className="text-sm text-muted-foreground hover:text-foreground">
          ← All content types
        </a>
        <Card>
          <CardHeader>
            <CardTitle>{isNewEntry && entries.length > 0 ? "New entry" : props.title}</CardTitle>
            <CardDescription>
              {isNewEntry && entries.length > 0
                ? `Create a ${contentType} entry`
                : `Content type ${contentType} — ${entries.length === 0 ? "no entries yet" : "new entry"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onCreate(e)} className="flex flex-col gap-4">
              {editableFields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  locale={locale}
                  value={values[field.key] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
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
                  {creating ? "Creating…" : "Create draft"}
                </Button>
                {isNewEntry && entries.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void selectEntry(entries[0]!.id)}
                  >
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

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <a href="/admin/content" className="text-sm text-muted-foreground hover:text-foreground">
        ← All content types
      </a>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="shrink-0 lg:w-64">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">{contentType}</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={startNewEntry}>
              + New
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-2 pt-0">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => void selectEntry(entry.id)}
                className={
                  selectedId === entry.id
                    ? "rounded-md bg-muted px-3 py-2 text-left text-sm font-medium"
                    : "rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60"
                }
              >
                {entryLabel(entry, schema, locale)}
                <span className="ml-2 text-xs uppercase text-muted-foreground">{entry.status}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>{props.title}</CardTitle>
            {props.description && <CardDescription>{props.description}</CardDescription>}
            <p className="text-xs text-muted-foreground">
              Type: {contentType} · Locale: {locale} · Status: {status}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-4">
              {editableFields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  locale={locale}
                  value={values[field.key] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
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
                <Button type="submit" disabled={saving || publishing}>
                  {saving ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || publishing}
                  onClick={() => void onPublish()}
                >
                  {publishing ? "Publishing…" : "Save & publish"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
