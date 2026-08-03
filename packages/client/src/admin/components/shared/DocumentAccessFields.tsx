import type { DocumentShareSlotLabels } from "./DocumentShareField";
import { DocumentShareField } from "./DocumentShareField";
import type { DocumentTagsFieldLabels } from "./DocumentTagsField";
import { DocumentTagsField } from "./DocumentTagsField";

export type DocumentAccessLabels = DocumentTagsFieldLabels & DocumentShareSlotLabels;

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
      {showShare && documentId ? (
        <div className="flex flex-col gap-4">
          <DocumentShareField documentId={documentId} labels={labels} slot="editor" />
          <DocumentShareField documentId={documentId} labels={labels} slot="publisher" />
        </div>
      ) : null}
    </>
  );
}
