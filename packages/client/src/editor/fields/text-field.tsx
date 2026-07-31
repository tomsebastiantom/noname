import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

function textFieldDisplayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function TextField({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldKey}>{label}</Label>
      <Input
        id={fieldKey}
        value={textFieldDisplayValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
