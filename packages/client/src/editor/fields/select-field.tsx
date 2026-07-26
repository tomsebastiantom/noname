import { Label } from "../../components/ui/label";

export function SelectField({
  fieldKey,
  label,
  value,
  options,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const selected = typeof value === "string" ? value : (options[0] ?? "");

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldKey}>{label}</Label>
      <select
        id={fieldKey}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
