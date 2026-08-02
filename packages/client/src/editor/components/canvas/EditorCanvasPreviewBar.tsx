import type { CanvasPreviewWidth } from "../../editor-layout-prefs";
import { useEditorPrefs } from "../../hooks/use-editor-prefs";
import type { EditorShellLabels } from "../../schemas/components";

const PREVIEW_WIDTHS: CanvasPreviewWidth[] = ["full", "tablet", "mobile"];

function previewLabel(width: CanvasPreviewWidth, labels: EditorShellLabels): string {
  if (width === "tablet") return labels.previewTabletLabel;
  if (width === "mobile") return labels.previewMobileLabel;
  return labels.previewFullLabel;
}

export function EditorCanvasPreviewBar({ labels }: Readonly<{ labels: EditorShellLabels }>) {
  const { layout, setLayout } = useEditorPrefs();

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-3 py-1.5"
      role="toolbar"
      aria-label={labels.previewBarAriaLabel}
    >
      {PREVIEW_WIDTHS.map((width) => {
        const active = layout.canvasPreview === width;
        return (
          <button
            key={width}
            type="button"
            aria-pressed={active}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
            onClick={() => setLayout((current) => ({ ...current, canvasPreview: width }))}
          >
            {previewLabel(width, labels)}
          </button>
        );
      })}
    </div>
  );
}
