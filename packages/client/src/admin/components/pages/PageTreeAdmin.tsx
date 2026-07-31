import { useStateValue } from "@json-render/react";
import { useState } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
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
import { ADMIN_STATE } from "../../../core/admin-state";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import { type PageTreeEntry, ROUTING_DEFAULT_LOCALE } from "../../routing-entries";

function emptyEntry(): PageTreeEntry {
  return {
    id: `entry-${Date.now()}`,
    pageId: "",
    slug: { [ROUTING_DEFAULT_LOCALE]: "/" },
  };
}

type PageTreeAdminProps = ComponentCtx<{
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
}>;

function PageTreeFields({
  initialEntries,
  locale,
  props,
  loadError,
}: {
  initialEntries: PageTreeEntry[];
  locale: string;
  props: PageTreeAdminProps["props"];
  loadError: string | null | undefined;
}) {
  const { submit, pending, error, success } = useCatalogSubmit();
  const [entries, setEntries] = useState<PageTreeEntry[]>(initialEntries);

  async function handleSave() {
    await submit({
      action: "saveMainTree",
      params: { pages: entries },
      successMessage: props.treeSavedMessage,
    });
  }

  function updateEntry(index: number, patch: Partial<PageTreeEntry>) {
    setEntries((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateSlug(index: number, slug: string) {
    setEntries((rows) =>
      rows.map((row, i) => (i === index ? { ...row, slug: { ...row.slug, [locale]: slug } } : row)),
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      className="space-y-4"
    >
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
        <Button type="submit" disabled={pending}>
          {pending ? props.savingTreeLabel : props.saveTreeLabel}
        </Button>
        <a
          href="/admin/pages"
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          {props.pageDocumentsLinkLabel}
        </a>
      </div>

      {displayError ? (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

export function PageTreeAdmin({ props }: PageTreeAdminProps) {
  const locale = props.locale || ROUTING_DEFAULT_LOCALE;

  const treePages = useStateValue(ADMIN_STATE.routing.treePages) as PageTreeEntry[] | undefined;
  const treeStatus = useStateValue(ADMIN_STATE.routing.treeStatus) as string | null | undefined;
  const treeLoadedAt = useStateValue(ADMIN_STATE.routing.treeLoadedAt) as number | null | undefined;
  const loading = (useStateValue(ADMIN_STATE.routing.treeLoading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.routing.treeError) as string | null | undefined;

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

      <PageTreeFields
        key={treeLoadedAt ?? "loading"}
        initialEntries={treePages ?? []}
        locale={locale}
        props={props}
        loadError={loadError}
      />
    </div>
  );
}
