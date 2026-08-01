import { useStateValue } from "@json-render/react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { LayoutAdminLoaded } from "../../../core/actions/layout";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { layoutTemplateFromPath, parseSpecJson } from "../../layout-entries";
import { DataTable } from "../shared/DataTable";

type LayoutEntryConfig = {
  segment: string;
};

type LayoutEntryLabels = {
  title: string;
  description: string | null;
  saveLabel: string;
  savingLabel: string;
  publishLabel: string;
  publishingLabel: string;
  loadingLabel: string;
  draftSavedMessage: string;
  publishedMessage: string;
};

type LayoutEntryAdminProps = ComponentCtx<CatalogProps<LayoutEntryConfig, LayoutEntryLabels>>;

type LayoutDetailLoaded = Extract<LayoutAdminLoaded, { mode: "detail" }>;

function LayoutEntryDetailFields({
  loaded,
  labels,
  templateName,
  segment,
  loadError,
}: {
  loaded: LayoutDetailLoaded;
  labels: LayoutEntryLabels;
  templateName: string;
  segment: string;
  loadError: string | null | undefined;
}) {
  const { run, executeAction, error, success } = useCatalogSubmit();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [layoutId] = useState(loaded.layoutId);
  const [status, setStatus] = useState(loaded.status);
  const [specJson, setSpecJson] = useState(loaded.specJson);
  const [contentRef, setContentRef] = useState(loaded.contentRef);

  async function onPublish() {
    if (!layoutId) return;

    await run(
      async () => {
        parseSpecJson(specJson);
        await executeAction("saveLayoutEntry", {
          id: layoutId,
          specJson,
          contentRef: contentRef || null,
        });
        await executeAction("publishLayoutEntry", { id: layoutId });
        setStatus("published");
      },
      {
        successMessage: labels.publishedMessage,
        onPendingChange: setPublishing,
      },
    );
  }

  async function handleSave() {
    if (!layoutId) return;

    await run(
      async () => {
        parseSpecJson(specJson);
        await executeAction("saveLayoutEntry", {
          id: layoutId,
          specJson,
          contentRef: contentRef || null,
        });
        setStatus("draft");
      },
      {
        successMessage: labels.draftSavedMessage,
        onPendingChange: setSaving,
      },
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <a href="/admin/layout" className="text-sm text-muted-foreground hover:text-foreground">
        ← All layouts
      </a>

      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description && <CardDescription>{labels.description}</CardDescription>}
          <p className="text-xs text-muted-foreground">
            Template: {templateName} · Segment: {segment} · Status: {status}
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="flex flex-col gap-4"
          >
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

            {displayError && (
              <Alert variant="destructive">
                <AlertDescription>{displayError}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || publishing}>
                {saving ? labels.savingLabel : labels.saveLabel}
              </Button>
              {loaded.canPublish && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || publishing}
                  onClick={() => void onPublish()}
                >
                  {publishing ? labels.publishingLabel : labels.publishLabel}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function LayoutEntryAdmin({ props }: LayoutEntryAdminProps) {
  const { config, labels } = props;
  const segment = config.segment || "default";
  const templateName = layoutTemplateFromPath(window.location.pathname);
  const loadParams = useMemo(() => ({ templateName, segment }), [templateName, segment]);
  useMountAction("loadLayoutAdmin", loadParams);

  const loaded = useStateValue(ADMIN_STATE.layout.loaded) as LayoutAdminLoaded | null | undefined;
  const loading = (useStateValue(ADMIN_STATE.layout.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.layout.error) as string | null | undefined;

  const layouts = loaded?.mode === "list" ? loaded.layouts : [];

  if (loading) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (!templateName) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description && <CardDescription>{labels.description}</CardDescription>}
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

  if (loaded?.mode !== "detail" || !loaded.layoutId) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
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
    <LayoutEntryDetailFields
      key={loaded.loadedAt}
      loaded={loaded}
      labels={labels}
      templateName={templateName}
      segment={segment}
      loadError={loadError}
    />
  );
}
