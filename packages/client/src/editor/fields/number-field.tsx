import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

export function NumberField({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  onChange: (value: number) => void;
}) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldKey}>{label}</Label>
      <Input
        id={fieldKey}
        type="number"
        value={Number.isFinite(numeric) ? numeric : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
