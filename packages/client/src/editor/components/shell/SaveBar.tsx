import { type ReactNode, useState } from "react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import type { EditorShellLabels } from "../../schemas/components";
import { EditorPanelCloseButton } from "./editor-panel-controls";

export function SaveBar({
  dirty,
  status,
  canPublish,
  hasPendingBlock,
  error,
  success,
  saveConflict,
  activityLabel,
  presence,
  labels,
  onSave,
  onPublish,
  onDiscard,
  onExitEdit,
  onCollapse,
  onRefreshConflict,
}: Readonly<{
  dirty: boolean;
  status: string | null;
  canPublish: boolean;
  hasPendingBlock?: boolean;
  error: string | null;
  success: string | null;
  saveConflict?: boolean;
  activityLabel?: string | null;
  presence?: ReactNode;
  labels: EditorShellLabels;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onDiscard: () => void;
  onExitEdit: () => void;
  onCollapse?: () => void;
  onRefreshConflict?: () => void;
}>) {
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const statusLabel = dirty
    ? labels.unsavedLabel
    : (activityLabel ?? (status === "published" ? labels.publishedLabel : labels.draftSavedLabel));

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4 py-2">
      <div className="flex items-center gap-2">
        {onCollapse ? (
          <EditorPanelCloseButton label={labels.hideToolbarLabel} onClick={onCollapse} />
        ) : null}
        <span className="text-sm font-medium">{labels.title}</span>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
        {presence}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onExitEdit}>
          {labels.exitEditLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={onDiscard}>
          {labels.discardLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={saving || publishing}
          onClick={() => {
            setSaving(true);
            void onSave().finally(() => setSaving(false));
          }}
        >
          {saving ? labels.savingLabel : labels.saveLabel}
        </Button>
        {canPublish ? (
          <Button
            type="button"
            size="sm"
            disabled={saving || publishing}
            onClick={() => {
              setPublishing(true);
              void onPublish().finally(() => setPublishing(false));
            }}
          >
            {publishing ? labels.publishingLabel : labels.publishLabel}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground" title={labels.publishPermissionTitle}>
            {labels.publishAdminOnlyHint}
          </span>
        )}
      </div>
      <p className="w-full text-xs text-muted-foreground">
        <strong>{labels.saveLabel}</strong> — {labels.saveHelpText}
        {hasPendingBlock ? <> {labels.pendingBlockHelpText}</> : null}
      </p>
      {error ? (
        <Alert variant="destructive" className="w-full py-2">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            {saveConflict && onRefreshConflict ? (
              <Button type="button" size="sm" variant="outline" onClick={onRefreshConflict}>
                {labels.refreshLayoutLabel}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert className="w-full py-2">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
    </header>
  );
}
