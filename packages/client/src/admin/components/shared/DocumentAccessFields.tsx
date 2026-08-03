import type { DocumentFolderFieldLabels } from "./DocumentFolderField";
import { DocumentFolderField } from "./DocumentFolderField";
import type { DocumentShareSlotLabels } from "./DocumentShareField";
import { DocumentShareField } from "./DocumentShareField";

export type DocumentAccessLabels = DocumentFolderFieldLabels & DocumentShareSlotLabels;

export function DocumentAccessFields({
  folderFieldId,
  folderInput,
  onFolderInputChange,
  labels,
  documentId,
  showShare = false,
}: {
  folderFieldId: string;
  folderInput: string;
  onFolderInputChange: (value: string) => void;
  labels: DocumentAccessLabels;
  documentId?: string;
  showShare?: boolean;
}) {
  return (
    <>
      <DocumentFolderField
        id={folderFieldId}
        value={folderInput}
        onChange={onFolderInputChange}
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
