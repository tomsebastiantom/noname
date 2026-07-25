import { type FormEvent, useEffect, useState } from "react";
import {
  listRoutingPages,
  loadRoutingPage,
  type RoutingPageView,
  routingPageKeyFromPath,
  saveRoutingPage,
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

export function PageEntryAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
}>) {
  const pageKey = routingPageKeyFromPath(window.location.pathname);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pages, setPages] = useState<RoutingPageView[]>([]);
  const [layoutRef, setLayoutRef] = useState("home");
  const [contentRef, setContentRef] = useState("");
  const [status, setStatus] = useState("draft");
  const [newPageKey, setNewPageKey] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!pageKey) {
          const rows = await listRoutingPages();
          if (!cancelled) setPages(rows);
          return;
        }

        const row = await loadRoutingPage(pageKey);
        if (!row) throw new Error(`Routing page "${pageKey}" not found`);
        if (!cancelled) {
          setLayoutRef(row.layoutRef);
          setContentRef(row.contentRef);
          setStatus(row.status);
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
  }, [pageKey]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!pageKey) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveRoutingPage({ pageKey, layoutRef, contentRef: contentRef || null });
      setSuccess("Page document saved.");
      const row = await loadRoutingPage(pageKey);
      if (row) setStatus(row.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const key = newPageKey.trim();
    if (!key) return;
    setCreating(true);
    setError(null);
    try {
      await saveRoutingPage({ pageKey: key, layoutRef: "home", contentRef: null });
      window.location.href = `/admin/pages/${encodeURIComponent(key)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading pages…</p>;
  }

  if (!pageKey) {
    return (
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-muted-foreground">
          {props.description ??
            "Routing page documents bind a layout template and optional contentRef for storefront URLs."}
        </p>

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2">
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            Edit URL tree →
          </a>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">New page document</CardTitle>
            <CardDescription>
              Key used by page_tree entries (e.g. home, product-demo)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreate(e)} className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                <Label htmlFor="new-page-key">Page key</Label>
                <Input
                  id="new-page-key"
                  value={newPageKey}
                  onChange={(e) => setNewPageKey(e.target.value)}
                  placeholder="about"
                  required
                />
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing page documents yet.</p>
        ) : (
          <div className="grid gap-2">
            {pages.map((row) => (
              <a
                key={row.id}
                href={`/admin/pages/${encodeURIComponent(row.key)}`}
                className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{row.key}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      layout: {row.layoutRef || "—"}
                      {row.contentRef ? ` · content: ${row.contentRef}` : ""}
                    </p>
                  </div>
                  <span className="text-xs uppercase text-muted-foreground">{row.status}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-sm text-muted-foreground">
        Page key <span className="font-mono">{pageKey}</span>
        {status ? ` · ${status}` : ""}
      </p>

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="layout-ref">Layout template</Label>
          <Input
            id="layout-ref"
            value={layoutRef}
            onChange={(e) => setLayoutRef(e.target.value)}
            placeholder="home"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-ref">Content ref</Label>
          <Input
            id="content-ref"
            value={contentRef}
            onChange={(e) => setContentRef(e.target.value)}
            placeholder="page:uuid or product:uuid"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Format: type:id — merged into layout via $state on the edge.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <a
            href="/admin/pages"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            ← All pages
          </a>
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            URL tree
          </a>
        </div>
      </form>
    </div>
  );
}
