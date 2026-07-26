import { Label } from "../../components/ui/label";

export function ToggleField({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
}) {
  const checked = value === true;

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={fieldKey}>{label}</Label>
      <input
        id={fieldKey}
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
