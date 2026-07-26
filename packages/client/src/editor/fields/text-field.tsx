import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

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
        value={typeof value === "string" ? value : value == null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
