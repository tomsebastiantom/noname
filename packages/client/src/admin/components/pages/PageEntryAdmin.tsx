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
import type { RoutingPageLoaded } from "../../../core/actions/routing";
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { type RoutingPageView, routingPageKeyFromPath } from "../../routing-entries";
import { DataTable } from "../shared/DataTable";

type PageEntryConfig = Record<string, never>;

type PageEntryLabels = {
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
  pageKeyLabel: string;
  statusSeparator: string;
  layoutRefLabel: string;
  layoutRefPlaceholder: string;
  contentRefLabel: string;
  contentRefPlaceholder: string;
  contentRefHint: string;
  newPageTitle: string;
  newPageDescription: string;
  newPageKeyLabel: string;
  newPageKeyPlaceholder: string;
  emptyListMessage: string;
  pageKeyColumnHeader: string;
  layoutColumnHeader: string;
  contentRefColumnHeader: string;
  statusColumnHeader: string;
  pageNotFoundPrefix: string;
  pageNotFoundSuffix: string;
};

type PageEntryAdminProps = ComponentCtx<CatalogProps<PageEntryConfig, PageEntryLabels>>;

function PageEntryDetailFields({
  page,
  pageKey,
  labels,
  loadError,
}: {
  page: RoutingPageLoaded;
  pageKey: string;
  labels: PageEntryLabels;
  loadError: string | null | undefined;
}) {
  const { submit, pending, error, success } = useCatalogSubmit();
  const [layoutRef, setLayoutRef] = useState(page.layoutRef);
  const [contentRef, setContentRef] = useState(page.contentRef);
  const [status] = useState(page.status);

  async function handleSave() {
    await submit({
      action: "saveRoutingPage",
      params: {
        pageKey,
        layoutRef,
        contentRef: contentRef || null,
      },
      successMessage: labels.pageSavedMessage,
    });
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-sm text-muted-foreground">
        {labels.pageKeyLabel} <span className="font-mono">{pageKey}</span>
        {status ? `${labels.statusSeparator}${status}` : ""}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="space-y-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="layout-ref">{labels.layoutRefLabel}</Label>
          <Input
            id="layout-ref"
            value={layoutRef}
            onChange={(e) => setLayoutRef(e.target.value)}
            placeholder={labels.layoutRefPlaceholder}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-ref">{labels.contentRefLabel}</Label>
          <Input
            id="content-ref"
            value={contentRef}
            onChange={(e) => setContentRef(e.target.value)}
            placeholder={labels.contentRefPlaceholder}
          />
          <p className="text-xs text-muted-foreground">{labels.contentRefHint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? labels.savingLabel : labels.saveLabel}
          </Button>
          <a
            href="/admin/pages"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            {labels.allPagesLinkLabel}
          </a>
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            {labels.urlTreeLinkLabel}
          </a>
        </div>
      </form>
    </div>
  );
}

export function PageEntryAdmin({ props }: PageEntryAdminProps) {
  const { labels } = props;
  const pageKey = routingPageKeyFromPath(window.location.pathname);
  const createCatalog = useCatalogSubmit();
  const loadAction = pageKey ? "loadRoutingPage" : "listRoutingPages";
  const loadParams = useMemo(() => (pageKey ? { pageKey } : null), [pageKey]);

  const pages = (useStateValue(ADMIN_STATE.routing.pages) as RoutingPageView[] | undefined) ?? [];
  const currentPage = useStateValue(ADMIN_STATE.routing.currentPage) as
    | RoutingPageLoaded
    | undefined;
  const loading = (useStateValue(ADMIN_STATE.routing.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.routing.error) as string | null | undefined;

  const [newPageKey, setNewPageKey] = useState("");

  useMountAction(loadAction, loadParams);

  async function handleCreate() {
    const key = newPageKey.trim();
    if (!key) return;
    await createCatalog.run(async () => {
      await createCatalog.executeAction("saveRoutingPage", {
        pageKey: key,
        layoutRef: "home",
        contentRef: null,
      });
      window.location.href = `/admin/pages/${encodeURIComponent(key)}`;
    });
  }

  const listDisplayError = mergeCatalogError(createCatalog.error, loadError);

  if (loading) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (!pageKey) {
    return (
      <div className="max-w-3xl">
        {labels.description ? (
          <p className="mb-4 text-sm text-muted-foreground">{labels.description}</p>
        ) : null}

        {listDisplayError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{listDisplayError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2">
          <a
            href="/admin/pages/tree"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
          >
            {labels.editUrlTreeLabel}
          </a>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{labels.newPageTitle}</CardTitle>
            <CardDescription>{labels.newPageDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreate();
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                <Label htmlFor="new-page-key">{labels.newPageKeyLabel}</Label>
                <Input
                  id="new-page-key"
                  value={newPageKey}
                  onChange={(e) => setNewPageKey(e.target.value)}
                  placeholder={labels.newPageKeyPlaceholder}
                  required
                />
              </div>
              <Button type="submit" disabled={createCatalog.pending}>
                {createCatalog.pending ? labels.creatingLabel : labels.createLabel}
              </Button>
            </form>
          </CardContent>
        </Card>

        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.emptyListMessage}</p>
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
                header: labels.pageKeyColumnHeader,
                cell: (row) => <span className="font-medium">{row.key}</span>,
              },
              {
                key: "layout",
                header: labels.layoutColumnHeader,
                cell: (row) => row.layoutRef || "—",
              },
              {
                key: "content",
                header: labels.contentRefColumnHeader,
                cell: (row) => row.contentRef || "—",
              },
              {
                key: "status",
                header: labels.statusColumnHeader,
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

  if (!currentPage) {
    return (
      <p className="text-sm text-muted-foreground">
        {labels.pageNotFoundPrefix} <span className="font-mono">{pageKey}</span>{" "}
        {labels.pageNotFoundSuffix}
      </p>
    );
  }

  return (
    <PageEntryDetailFields
      key={currentPage.loadedAt}
      page={currentPage}
      pageKey={pageKey}
      labels={labels}
      loadError={loadError}
    />
  );
}
