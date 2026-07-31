import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { ContentFieldSchema } from "../../content-entries";
import { MediaFieldInput, type MediaFieldLabels } from "./MediaFieldInput";
import { ReferenceFieldInput } from "./ReferenceFieldInput";

export function ContentEntryFieldInput({
  field,
  value,
  onChange,
  locale,
  mediaLabels,
}: {
  field: ContentFieldSchema;
  value: string;
  onChange: (value: string) => void;
  locale: string;
  mediaLabels: MediaFieldLabels;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="size-4 rounded border-input"
        />
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }

  if (field.type === "media") {
    return (
      <MediaFieldInput
        label={field.label}
        required={field.required}
        value={value}
        onChange={onChange}
        labels={mediaLabels}
      />
    );
  }

  if (field.type === "reference") {
    return (
      <ReferenceFieldInput
        label={field.label}
        required={field.required}
        targetContentType={field.references ?? ""}
        locale={locale}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "longText") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field.key}>
          {field.label}
          {field.required ? " *" : ""}
          {field.isLocalizable ? " (localized)" : ""}
        </Label>
        <textarea
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          required={field.required}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required ? " *" : ""}
        {field.isLocalizable ? " (localized)" : ""}
      </Label>
      <Input
        id={field.key}
        type={field.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    </div>
  );
}
