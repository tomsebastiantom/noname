import type { EditorShellLabels } from "../../schemas/components";

/** Explains layout template vs page content scope (Phase A — D3c). */
export function EditorScopeBanner({
  templateName,
  pageContentRef,
  labels,
}: Readonly<{
  templateName: string;
  pageContentRef: string | null;
  labels: EditorShellLabels;
}>) {
  return (
    <div className="shrink-0 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{labels.scopeLayoutTitle}</span>{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{templateName}</code>
        {" — "}
        {labels.scopeLayoutBody}
      </p>
      {pageContentRef ? (
        <p className="mt-1">
          <span className="font-medium text-foreground">{labels.scopeContentTitle}</span>{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{pageContentRef}</code>
          {" — "}
          {labels.scopeContentBody}
        </p>
      ) : (
        <p className="mt-1">{labels.scopeNoContentBody}</p>
      )}
    </div>
  );
}
