import type { DocumentShareFieldLabels } from "./DocumentShareField";
import { DocumentShareField } from "./DocumentShareField";
import type { DocumentTagsFieldLabels } from "./DocumentTagsField";
import { DocumentTagsField } from "./DocumentTagsField";

export type DocumentAccessLabels = DocumentTagsFieldLabels & DocumentShareFieldLabels;

export function DocumentAccessFields({
  tagsFieldId,
  tagsInput,
  onTagsInputChange,
  labels,
  documentId,
  showShare = false,
}: {
  tagsFieldId: string;
  tagsInput: string;
  onTagsInputChange: (value: string) => void;
  labels: DocumentAccessLabels;
  documentId?: string;
  showShare?: boolean;
}) {
  return (
    <>
      <DocumentTagsField
        id={tagsFieldId}
        value={tagsInput}
        onChange={onTagsInputChange}
        labels={labels}
      />
      {showShare && documentId && <DocumentShareField documentId={documentId} labels={labels} />}
    </>
  );
}
