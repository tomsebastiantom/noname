import { lazy, Suspense } from "react";
import type { MediaFieldLabels } from "./MediaFieldInput";

const RichTextTipTapEditor = lazy(() =>
  import("../../../components/rich-text/RichTextTipTapEditor").then((m) => ({
    default: m.RichTextTipTapEditor,
  })),
);

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
    <Suspense
      fallback={
        <div className="min-h-40 rounded-md border border-input bg-muted/30" aria-busy="true" />
      }
    >
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
    </Suspense>
  );
}
