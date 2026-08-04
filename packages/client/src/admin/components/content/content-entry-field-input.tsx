import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { ReferenceFieldOptions } from "../../../core/actions/content";
import type { ContentFieldSchema } from "../../content-entries";
import { MediaFieldInput, type MediaFieldLabels } from "./MediaFieldInput";
import { ReferenceFieldInput, type ReferenceFieldLabels } from "./ReferenceFieldInput";
import { EmailSpecFieldInput } from "./EmailSpecFieldInput";

const defaultReferenceLabels: ReferenceFieldLabels = {
  entriesLoadingLabel: "Loading entries…",
  emptyLabel: "No {type} entries yet.",
  selectedPrefix: "Selected:",
  clearLabel: "Clear",
  missingTargetMessage:
    'Reference field "{label}" is missing schema references (target content type).',
};

export function ContentEntryFieldInput({
  field,
  value,
  onChange,
  locale,
  contentType,
  mediaLabels,
  referenceLabels = defaultReferenceLabels,
  referenceOptions,
}: {
  field: ContentFieldSchema;
  value: string;
  onChange: (value: string) => void;
  locale: string;
  contentType?: string;
  mediaLabels: MediaFieldLabels;
  referenceLabels?: ReferenceFieldLabels;
  referenceOptions?: Record<string, ReferenceFieldOptions>;
}) {
  if (contentType === "notification_email" && field.key === "spec") {
    return <EmailSpecFieldInput field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "json") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field.key}>
          {field.label}
          {field.required ? " *" : ""}
        </Label>
        <textarea
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          required={field.required}
          spellCheck={false}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
        />
      </div>
    );
  }
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
    const targetContentType = field.references ?? "";
    return (
      <ReferenceFieldInput
        label={field.label}
        required={field.required}
        targetContentType={targetContentType}
        locale={locale}
        value={value}
        onChange={onChange}
        labels={referenceLabels}
        referenceOptions={targetContentType ? referenceOptions?.[targetContentType] : undefined}
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
