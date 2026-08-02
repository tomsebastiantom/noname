import { Button } from "../../../components/ui/button";

/** Same close control as panel headers (×). */
export function EditorPanelCloseButton({
  label,
  onClick,
}: Readonly<{
  label: string;
  onClick: () => void;
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 shrink-0 p-0"
      aria-label={label}
      onClick={onClick}
    >
      ×
    </Button>
  );
}
