import { RichTextTipTapEditor } from "../../../components/rich-text/RichTextTipTapEditor";
import type { MediaFieldLabels } from "./MediaFieldInput";

export function RichTextFieldInput({
  label,
  required,
  value,
  onChange,
  referenceTarget,
  mediaLabels,
  constraints,
  contentDocumentId,
  fieldKey,
  locale,
  onFocus,
}: Readonly<{
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  referenceTarget?: string;
  mediaLabels?: MediaFieldLabels;
  constraints?: Record<string, unknown>;
  contentDocumentId?: string | null;
  fieldKey?: string;
  locale?: string;
  onFocus?: () => void;
}>) {
  const labels: MediaFieldLabels = mediaLabels ?? {
    uploadFileLabel: "Upload file",
    uploadingLabel: "Uploading…",
    pickExistingLabel: "Pick existing asset",
    loadingAssetsLabel: "Loading assets…",
    clearLabel: "Clear",
  };

  return (
    <RichTextTipTapEditor
      label={label}
      required={required}
      value={value}
      onChange={onChange}
      referenceTarget={referenceTarget}
      mediaLabels={labels}
      constraints={constraints}
      contentDocumentId={contentDocumentId}
      fieldKey={fieldKey}
      locale={locale}
      onFocus={onFocus}
    />
  );
}
