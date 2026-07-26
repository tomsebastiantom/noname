import { Button } from "../components/ui/button";
import { NumberField } from "./fields/number-field";
import { SelectField } from "./fields/select-field";
import { TextField } from "./fields/text-field";
import { ToggleField } from "./fields/toggle-field";
import { applyFieldChange, type EditFieldDef, type PropsPanelProps } from "./types";

function UnsupportedField({ label, type }: { label: string; type: string }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      {label}: <span className="font-medium">{type}</span> editor coming soon
    </p>
  );
}

function EditField({
  fieldKey,
  def,
  value,
  onChange,
}: {
  fieldKey: string;
  def: EditFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (def.type) {
    case "text":
      return <TextField fieldKey={fieldKey} label={def.label} value={value} onChange={onChange} />;
    case "select":
      return (
        <SelectField
          fieldKey={fieldKey}
          label={def.label}
          value={value}
          options={def.options ?? []}
          onChange={onChange}
        />
      );
    case "toggle":
      return (
        <ToggleField fieldKey={fieldKey} label={def.label} value={value} onChange={onChange} />
      );
    case "number":
      return (
        <NumberField fieldKey={fieldKey} label={def.label} value={value} onChange={onChange} />
      );
    default:
      return <UnsupportedField label={def.label} type={def.type} />;
  }
}

export function PropsPanel({ label, path, fields, values, onChange, onClose }: PropsPanelProps) {
  const handleFieldChange = (fieldKey: string, nextValue: unknown) => {
    onChange(applyFieldChange(values, fieldKey, nextValue));
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close props panel"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Edit component
            </p>
            <h2 className="text-lg font-semibold">{label ?? "Properties"}</h2>
            {path ? <p className="mt-1 font-mono text-xs text-muted-foreground">{path}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {Object.entries(fields).map(([fieldKey, def]) => (
            <EditField
              key={fieldKey}
              fieldKey={fieldKey}
              def={def}
              value={values[fieldKey]}
              onChange={(nextValue) => handleFieldChange(fieldKey, nextValue)}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
