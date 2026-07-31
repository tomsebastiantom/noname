import { useActions, useStateValue } from "@json-render/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
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
import { ADMIN_STATE } from "../../core/admin-state";
import { useMountAction } from "../../core/components/MountAction";
import type { ComponentCtx } from "../../core/components/types";
import { type RoutingPageView, routingPageKeyFromPath } from "../routing-entries";
import { DataTable } from "./DataTable";

export function PageEntryAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  saveLabel: string;
  savingLabel: string;
  pageSavedMessage: string;
  createLabel: string;
  creatingLabel: string;
  loadingLabel: string;
  editUrlTreeLabel: string;
  allPagesLinkLabel: string;
  urlTreeLinkLabel: string;
}>) {
  const pageKey = routingPageKeyFromPath(window.location.pathname);
  const { execute } = useActions();
  const loadAction = pageKey ? "loadRoutingPage" : "listRoutingPages";
  const loadParams = useMemo(() => (pageKey ? { pageKey } : null), [pageKey]);

  const pages = (useStateValue(ADMIN_STATE.routing.pages) as RoutingPageView[] | undefined) ?? [];
  const currentPage = useStateValue(ADMIN_STATE.routing.currentPage) as RoutingPageView | undefined;
  const loading = (useStateValue(ADMIN_STATE.routing.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.routing.error) as string | null | undefined;

  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [layoutRef, setLayoutRef] = useState("home");
  const [contentRef, setContentRef] = useState("");
  const [status, setStatus] = useState("draft");
  const [newPageKey, setNewPageKey] = useState("");

  useEffect(() => {
    if (currentPage) {
      setLayoutRef(currentPage.layoutRef);
      setContentRef(currentPage.contentRef);
      setStatus(currentPage.status);
    }
  }, [currentPage]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!pageKey) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await execute({
        action: "saveRoutingPage",
        params: {
          pageKey,
          layoutRef,
          contentRef: contentRef || null,
        },
      });
      setSuccess(props.pageSavedMessage);
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
      await execute({
        action: "saveRoutingPage",
        params: {
          pageKey: key,
          layoutRef: "home",
          contentRef: null,
        },
      });
      window.location.href = `/admin/pages/${encodeURIComponent(key)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  const displayError = error ?? loadError ?? null;

  useMountAction(loadAction, loadParams);

  if (loading) {
    return <p className="text-sm text-muted-foreground">{props.loadingLabel}</p>;
  }

  if (!pageKey) {
    return (
      <div className="max-w-3xl">
        {props.description ? (
          <p className="mb-4 text-sm text-muted-foreground">{props.description}</p>
        ) : null}

        {displayError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2">
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            {props.editUrlTreeLabel}
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
                {creating ? props.creatingLabel : props.createLabel}
              </Button>
            </form>
          </CardContent>
        </Card>

        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing page documents yet.</p>
        ) : (
          <DataTable
            rows={pages}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              window.location.href = `/admin/pages/${encodeURIComponent(row.key)}`;
            }}
            columns={[
              {
                key: "key",
                header: "Page key",
                cell: (row) => <span className="font-medium">{row.key}</span>,
              },
              { key: "layout", header: "Layout", cell: (row) => row.layoutRef || "—" },
              {
                key: "content",
                header: "Content ref",
                cell: (row) => row.contentRef || "—",
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.status === "published" ? "success" : "muted"}>
                    {row.status}
                  </Badge>
                ),
              },
            ]}
          />
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
            {saving ? props.savingLabel : props.saveLabel}
          </Button>
          <a
            href="/admin/pages"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            {props.allPagesLinkLabel}
          </a>
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            {props.urlTreeLinkLabel}
          </a>
        </div>
      </form>
    </div>
  );
}
