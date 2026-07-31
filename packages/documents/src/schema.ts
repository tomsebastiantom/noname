/** Wire content-type field definition (API + admin UI). */
export type FieldType =
  | "text"
  | "longText"
  | "richText"
  | "number"
  | "boolean"
  | "date"
  | "media"
  | "mediaList"
  | "reference"
  | "array"
  | "json"
  | "enum";

export interface ContentFieldSchema {
  key: string;
  type: FieldType;
  required: boolean;
  isLocalizable: boolean;
  label: string;
  /** Target content type for `reference` fields. */
  references?: string;
  constraints?: Record<string, unknown>;
  items?: { type: FieldType };
  options?: string[];
  permissions?: { read: string[]; write: string[] };
}

export interface ContentTypeSchema {
  fields: ContentFieldSchema[];
}
