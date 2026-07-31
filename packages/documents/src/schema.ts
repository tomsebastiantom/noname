/** Wire content-type field definition (API + admin UI). */
export interface ContentFieldSchema {
  key: string;
  type: string;
  required: boolean;
  isLocalizable: boolean;
  label: string;
  /** Target content type for `reference` fields. */
  references?: string;
}

export interface ContentTypeSchema {
  fields: ContentFieldSchema[];
}
