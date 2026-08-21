import { Button } from "../../../../components/ui/button";

export function AccessToggle({
  label,
  enabled,
  pending,
  onLabel,
  offLabel,
  savingLabel,
  disabled,
  onToggle,
}: {
  label?: string;
  enabled: boolean;
  pending: boolean;
  onLabel: string;
  offLabel: string;
  savingLabel: string;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const stateLabel = enabled ? onLabel : offLabel;
  const text = label ? `${label}: ${stateLabel}` : stateLabel;
  return (
    <Button
      type="button"
      variant={enabled ? "default" : "outline"}
      size="sm"
      disabled={disabled || pending}
      onClick={() => onToggle(!enabled)}
    >
      {pending ? savingLabel : text}
    </Button>
  );
}
