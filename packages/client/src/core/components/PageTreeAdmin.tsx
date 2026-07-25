import { type FormEvent, useEffect, useState } from "react";
import {
  loadMainTree,
  type PageTreeEntry,
  ROUTING_DEFAULT_LOCALE,
  saveMainTree,
} from "../../admin/routing-entries";
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
}>) {
  const locale = props.locale || ROUTING_DEFAULT_LOCALE;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [entries, setEntries] = useState<PageTreeEntry[]>([]);
  const [treeStatus, setTreeStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const tree = await loadMainTree();
        if (!cancelled) {
          setEntries(tree?.pages ?? []);
          setTreeStatus(tree?.status ?? null);
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
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveMainTree(entries);
      setSuccess("Page tree saved.");
      const tree = await loadMainTree();
      setTreeStatus(tree?.status ?? null);
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

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading page tree…</p>;
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-muted-foreground">
        {props.description ??
          "Map storefront URLs to routing page documents. Slugs are locale-aware."}
      </p>

      {treeStatus ? (
        <p className="mb-4 text-xs text-muted-foreground">Tree status: {treeStatus}</p>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
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
                    Remove entry
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
            Add entry
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save page tree"}
          </Button>
          <a
            href="/admin/pages"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            ← Page documents
          </a>
        </div>
      </form>
    </div>
  );
}
