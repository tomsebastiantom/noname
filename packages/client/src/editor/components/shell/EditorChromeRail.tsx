import { Button } from "../../../components/ui/button";
import type { EditorShellLabels } from "../../schemas/components";

/** Collapsed save bar + scope banner — click to expand full editor chrome. */
export function EditorChromeRail({
  dirty,
  hasError,
  labels,
  onExpand,
  onExitEdit,
  onSave,
}: Readonly<{
  dirty: boolean;
  hasError: boolean;
  labels: EditorShellLabels;
  onExpand: () => void;
  onExitEdit: () => void;
  onSave: () => Promise<void>;
}>) {
  return (
    <aside className="editor-chrome-rail shrink-0" aria-label={labels.chromeRailAriaLabel}>
      <button type="button" className="editor-chrome-rail-expand" onClick={onExpand}>
        {labels.chromeRailTitle}
        {dirty ? (
          <span className="editor-chrome-rail-dot editor-chrome-rail-dot--dirty" aria-hidden />
        ) : null}
        {hasError ? (
          <span
            className="editor-chrome-rail-dot editor-chrome-rail-dot--error"
            title={labels.chromeRailSaveErrorTitle}
            aria-hidden
          />
        ) : null}
      </button>
      <div className="editor-chrome-rail-actions">
        {dirty ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void onSave()}
          >
            {labels.saveLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onExitEdit}
        >
          {labels.exitEditLabel}
        </Button>
      </div>
    </aside>
  );
}
