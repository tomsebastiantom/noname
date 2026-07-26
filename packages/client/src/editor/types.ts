export type EditFieldType =
  | "text"
  | "select"
  | "toggle"
  | "number"
  | "color"
  | "image-picker"
  | "product-picker"
  | "rich-text"
  | "json";

export interface EditFieldDef {
  type: EditFieldType;
  label: string;
  options?: readonly string[];
}

export interface PropsPanelProps {
  label?: string;
  path?: string;
  fields: Record<string, EditFieldDef>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onClose: () => void;
}

/** Merge one field update into the values object (shallow copy). */
export function applyFieldChange(
  values: Record<string, unknown>,
  fieldKey: string,
  nextValue: unknown,
): Record<string, unknown> {
  return { ...values, [fieldKey]: nextValue };
}
