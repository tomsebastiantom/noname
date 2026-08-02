import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { mediaFieldLabelsSchema } from "../../../schemas/shared";
import { MediaFieldInput } from "../../content-fields";
import type { EditFieldDef } from "../../lib/types";
import type { EditorShellLabels } from "../../schemas/components";

export function EditorFieldControl({
  field,
  elementId,
  displayValue,
  shellLabels,
  onValueChange,
}: Readonly<{
  field: EditFieldDef;
  elementId: string;
  displayValue: string;
  shellLabels: EditorShellLabels;
  onValueChange: (value: unknown) => void;
}>) {
  const inputId = `${elementId}-${field.path}`;

  if (field.type === "boolean") {
    const checked = displayValue === "true";
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onValueChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "enum" && field.enumOptions?.length) {
    return (
      <select
        id={inputId}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={displayValue}
        onChange={(event) => onValueChange(event.target.value || null)}
      >
        {field.enumOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "action" && field.actionOptions?.length) {
    return (
      <select
        id={inputId}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={displayValue}
        onChange={(event) => onValueChange(event.target.value || null)}
      >
        <option value="">{shellLabels.actionNoneLabel}</option>
        {field.actionOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "media") {
    return (
      <MediaFieldInput
        label={field.label}
        required={false}
        value={displayValue}
        onChange={(value) => onValueChange(value || null)}
        labels={mediaFieldLabelsSchema.parse(shellLabels)}
      />
    );
  }

  if (field.type === "longText") {
    return (
      <textarea
        id={inputId}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={displayValue}
        onChange={(event) => onValueChange(event.target.value || null)}
      />
    );
  }

  return (
    <Input
      id={inputId}
      type={field.type === "number" ? "number" : "text"}
      value={displayValue}
      onChange={(event) => {
        let val: string | number | null = event.target.value;
        if (field.type === "number") {
          val = event.target.value === "" ? 0 : Number(event.target.value);
        } else if (val === "") {
          val = null;
        }
        onValueChange(val);
      }}
    />
  );
}

export function EditorFieldLabel({
  field,
  inputId,
}: Readonly<{ field: EditFieldDef; inputId: string }>) {
  if (field.type === "boolean") return null;
  return <Label htmlFor={inputId}>{field.label}</Label>;
}
