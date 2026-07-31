import { useActions } from "@json-render/react";
import { type FormEvent, useEffect, useState } from "react";
import { fetchAuthSessionStatus, sessionHasPermission } from "../../auth/team-users";
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
import type { ComponentCtx } from "../../core/components/types";
import {
  getLayoutForTemplate,
  type LayoutSummary,
  layoutTemplateFromPath,
  listLayouts,
  parseSpecJson,
  specToJson,
} from "../layout-entries";
import { DataTable } from "./DataTable";

export function LayoutEntryAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  segment: string;
  saveLabel: string;
  savingLabel: string;
  publishLabel: string;
  publishingLabel: string;
  loadingLabel: string;
  draftSavedMessage: string;
  publishedMessage: string;
}>) {
  const { execute } = useActions();
  const segment = props.segment || "default";
  const templateName = layoutTemplateFromPath(window.location.pathname);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [status, setStatus] = useState("draft");
  const [specJson, setSpecJson] = useState("");
  const [contentRef, setContentRef] = useState("");
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    void fetchAuthSessionStatus()
      .then((session) => setCanPublish(sessionHasPermission(session, "layout:publish")))
      .catch(() => setCanPublish(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!templateName) {
          const rows = await listLayouts(segment);
          if (!cancelled) setLayouts(rows);
          return;
        }

        const row = await getLayoutForTemplate(templateName, segment);
        if (!row) throw new Error(`Layout "${templateName}" not found`);

        if (!cancelled) {
          setLayoutId(row.id);
          setStatus(row.status);
          setSpecJson(specToJson(row.data.spec));
          setContentRef(row.data.contentRef ?? "");
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
  }, [templateName, segment]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!layoutId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      parseSpecJson(specJson);
      await execute({
        action: "saveLayoutEntry",
        params: {
          id: layoutId,
          specJson,
          contentRef: contentRef || null,
        },
      });
      setStatus("draft");
      setSuccess(props.draftSavedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    if (!layoutId) return;

    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      parseSpecJson(specJson);
      await execute({
        action: "saveLayoutEntry",
        params: {
          id: layoutId,
          specJson,
          contentRef: contentRef || null,
        },
      });
      await execute({ action: "publishLayoutEntry", params: { id: layoutId } });
      setStatus("published");
      setSuccess(props.publishedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{props.loadingLabel}</p>;
  }

  if (!templateName) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <DataTable
            rows={layouts}
            rowKey={(layout) => layout.id}
            onRowClick={(layout) => {
              window.location.href = `/admin/layout/${layout.templateName}`;
            }}
            emptyMessage="No layout templates yet. Seed with pnpm seed:demo."
            columns={[
              {
                key: "template",
                header: "Template",
                cell: (layout) => <span className="font-medium">{layout.templateName}</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (layout) => (
                  <Badge variant={layout.status === "published" ? "success" : "muted"}>
                    {layout.status}
                  </Badge>
                ),
              },
              {
                key: "contentRef",
                header: "Content ref",
                cell: (layout) => (layout.hasContentRef ? "Yes" : "—"),
              },
            ]}
          />
        </CardContent>
      </Card>
    );
  }

  if (!layoutId) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>
            Template <strong>{templateName}</strong> not found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/admin/layout"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            ← All layouts
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <a href="/admin/layout" className="text-sm text-muted-foreground hover:text-foreground">
        ← All layouts
      </a>

      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
          <p className="text-xs text-muted-foreground">
            Template: {templateName} · Segment: {segment} · Status: {status}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contentRef">contentRef (optional)</Label>
              <Input
                id="contentRef"
                value={contentRef}
                onChange={(e) => setContentRef(e.target.value)}
                placeholder="product:uuid or page:uuid — CMS merge on storefront"
              />
              <p className="text-xs text-muted-foreground">
                Storefront templates only. Login/admin specs usually leave this empty.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="specJson">json-render spec (JSON)</Label>
              <textarea
                id="specJson"
                value={specJson}
                onChange={(e) => setSpecJson(e.target.value)}
                rows={24}
                spellCheck={false}
                className="min-h-[320px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed"
              />
            </div>

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
                {saving ? props.savingLabel : props.saveLabel}
              </Button>
              {canPublish && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || publishing}
                  onClick={() => void onPublish()}
                >
                  {publishing ? props.publishingLabel : props.publishLabel}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
