import type { ReferenceFieldOptions } from "../../../core/actions/content";
import type { ContentEntryRow, ContentTypeSchema } from "../../content-entries";
import type { DocumentAccessLabels } from "../shared/DocumentAccessFields";
import type { MediaFieldLabels } from "./MediaFieldInput";
import type { ReferenceFieldLabels } from "./ReferenceFieldInput";

export type ContentEntryFormLabels = DocumentAccessLabels & {
  title: string;
  description: string | null;
  saveLabel: string;
  savingLabel: string;
  publishLabel: string;
  publishingLabel: string;
  deleteLabel: string;
  deletingLabel: string;
};

export type ContentEntryEditorProps = {
  contentType: string;
  locale: string;
  status: string;
  schema: ContentTypeSchema;
  entries: ContentEntryRow[];
  selectedId: string | null;
  values: Record<string, string>;
  tagsInput: string;
  labels: ContentEntryFormLabels;
  mediaLabels: MediaFieldLabels;
  referenceLabels: ReferenceFieldLabels;
  referenceOptions?: Record<string, ReferenceFieldOptions>;
  error: string | null;
  success: string | null;
  saving: boolean;
  publishing: boolean;
  deleting: boolean;
  canPublish: boolean;
  canManageAccess: boolean;
  onSelectEntry: (id: string) => void;
  onStartNewEntry: () => void;
  onValuesChange: (values: Record<string, string>) => void;
  onTagsInputChange: (value: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
};
