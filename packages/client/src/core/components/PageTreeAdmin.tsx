import { useActions, useStateValue } from "@json-render/react";
import { type FormEvent, useEffect, useState } from "react";
import { type PageTreeEntry, ROUTING_DEFAULT_LOCALE } from "../../admin/routing-entries";
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
import { ADMIN_STATE } from "../admin-state";
import { useMountAction } from "./MountAction";
import type { ComponentCtx } from "./types";

function emptyEntry(): PageTreeEntry {
  return {
    id: `entry-${Date.now()}`,
    pageId: "",
    slug: { [ROUTING_DEFAULT_LOCALE]: "/" },
  };
}

export function PageTreeAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  locale: string;
  saveTreeLabel: string;
  savingTreeLabel: string;
  treeSavedMessage: string;
  addEntryLabel: string;
  removeEntryLabel: string;
  pageDocumentsLinkLabel: string;
  treeLoadingLabel: string;
}>) {
  const locale = props.locale || ROUTING_DEFAULT_LOCALE;
  const { execute } = useActions();

  const treePages = useStateValue(ADMIN_STATE.routing.treePages) as PageTreeEntry[] | undefined;
  const treeStatus = useStateValue(ADMIN_STATE.routing.treeStatus) as string | null | undefined;
  const loading = (useStateValue(ADMIN_STATE.routing.treeLoading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.routing.treeError) as string | null | undefined;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [entries, setEntries] = useState<PageTreeEntry[]>([]);

  useEffect(() => {
    if (treePages) {
      setEntries(treePages);
    }
  }, [treePages]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await execute({ action: "saveMainTree", params: { pages: entries } });
      setSuccess(props.treeSavedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function updateEntry(index: number, patch: Partial<PageTreeEntry>) {
    setEntries((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateSlug(index: number, slug: string) {
    setEntries((rows) =>
      rows.map((row, i) => (i === index ? { ...row, slug: { ...row.slug, [locale]: slug } } : row)),
    );
  }

  const displayError = error ?? loadError ?? null;

  useMountAction("loadMainTree");

  if (loading) {
    return <p className="text-sm text-muted-foreground">{props.treeLoadingLabel}</p>;
  }

  return (
    <div className="max-w-3xl">
      {props.description ? (
        <p className="mb-4 text-sm text-muted-foreground">{props.description}</p>
      ) : null}

      {treeStatus ? (
        <p className="mb-4 text-xs text-muted-foreground">Tree status: {treeStatus}</p>
      ) : null}

      {displayError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="mb-4">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No URL mappings yet. Add an entry to connect a path to a page document.
            </CardContent>
          </Card>
        ) : (
          entries.map((entry, index) => (
            <Card key={entry.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Entry {index + 1}</CardTitle>
                <CardDescription>URL slug → page document key</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`entry-id-${index}`}>Entry id</Label>
                  <Input
                    id={`entry-id-${index}`}
                    value={entry.id}
                    onChange={(e) => updateEntry(index, { id: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`page-id-${index}`}>Page document key</Label>
                  <Input
                    id={`page-id-${index}`}
                    value={entry.pageId}
                    onChange={(e) => updateEntry(index, { pageId: e.target.value })}
                    placeholder="home"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`slug-${index}`}>URL slug ({locale})</Label>
                  <Input
                    id={`slug-${index}`}
                    value={entry.slug[locale] ?? ""}
                    onChange={(e) => updateSlug(index, e.target.value)}
                    placeholder="/about"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEntries((rows) => rows.filter((_, i) => i !== index))}
                  >
                    {props.removeEntryLabel}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEntries((rows) => [...rows, emptyEntry()])}
          >
            {props.addEntryLabel}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? props.savingTreeLabel : props.saveTreeLabel}
          </Button>
          <a
            href="/admin/pages"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            {props.pageDocumentsLinkLabel}
          </a>
        </div>
      </form>
    </div>
  );
}
