import type { z } from "zod";
import { isHiddenEditorField } from "./field-filter";
import { isActionFieldKey, storefrontEditorActionOptions } from "./storefront-action-options";
import type { EditFieldDef, EditFieldType } from "./types";

type ZodDef = {
  type: string;
  innerType?: z.ZodType;
  defaultValue?: unknown | (() => unknown);
  shape?: Record<string, z.ZodType>;
  values?: unknown[];
};

function zodDef(schema: z.ZodType): ZodDef {
  return (schema as z.ZodType & { def: ZodDef }).def;
}

function unwrapZod(schema: z.ZodType): { inner: z.ZodType; defaultValue?: unknown } {
  let current = schema;
  let defaultValue: unknown;

  for (;;) {
    const def = zodDef(current);
    if (def.type === "default") {
      defaultValue = typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
      current = def.innerType!;
      continue;
    }
    if (def.type === "optional" || def.type === "nullable") {
      current = def.innerType!;
      continue;
    }
    break;
  }

  return { inner: current, defaultValue };
}

function enumValues(schema: z.ZodType): unknown[] | undefined {
  const options = (schema as z.ZodType & { options?: unknown[] }).options;
  if (options) return options;
  return zodDef(schema).values;
}

function defaultForZodField(schema: z.ZodType, _key: string): unknown {
  const { inner, defaultValue } = unwrapZod(schema);
  if (defaultValue !== undefined) return defaultValue;

  const type = zodDef(inner).type;
  if (type === "string") return "";
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "enum") return enumValues(inner)?.[0] ?? null;
  if (type === "null") return null;
  return null;
}

function fieldTypeForZod(schema: z.ZodType, key: string): EditFieldType | null {
  const { inner } = unwrapZod(schema);
  const type = zodDef(inner).type;
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "enum") return "enum";
  if (type === "string") {
    if (isActionFieldKey(key)) return "action";
    if (/description|content|subtitle|body/i.test(key)) return "longText";
    if (/^(image|src|logoUrl|icon|thumbnail|photo)$/i.test(key)) return "media";
    return "text";
  }
  if (type === "nullable") {
    const innerType = zodDef(inner).innerType;
    return innerType ? fieldTypeForZod(innerType, key) : null;
  }
  return null;
}

function humanizeFieldLabel(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function objectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  if (zodDef(schema).type !== "object") return null;
  return zodDef(schema).shape ?? null;
}

function isSkippableField(schema: z.ZodType): boolean {
  const { inner } = unwrapZod(schema);
  const type = zodDef(inner).type;
  return type === "object" || type === "array" || type === "record";
}

export function defaultsFromZodShape(
  shape: Record<string, z.ZodType>,
  seeds: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...seeds };
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (key in out) continue;
    if (isSkippableField(fieldSchema)) continue;
    out[key] = defaultForZodField(fieldSchema, key);
  }
  return out;
}

export function fieldsFromZodShape(
  bucket: "config" | "labels",
  shape: Record<string, z.ZodType>,
): EditFieldDef[] {
  const fields: EditFieldDef[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (isSkippableField(fieldSchema)) continue;
    const type = fieldTypeForZod(fieldSchema, key);
    if (!type) continue;
    const path = `${bucket}.${key}`;
    if (isHiddenEditorField(path)) continue;
    const field: EditFieldDef = {
      path,
      label: humanizeFieldLabel(key),
      type,
    };
    if (type === "enum") {
      const { inner } = unwrapZod(fieldSchema);
      const options = enumValues(inner);
      if (options?.length) field.enumOptions = options.map(String);
    }
    if (type === "action") {
      field.actionOptions = storefrontEditorActionOptions();
    }
    fields.push(field);
  }
  return fields;
}

export function parseCatalogPropsSchema(propsSchema: z.ZodType): {
  configShape: Record<string, z.ZodType>;
  labelsShape: Record<string, z.ZodType>;
} | null {
  const root = objectShape(propsSchema);
  if (!root?.config || !root.labels) return null;
  const configShape = objectShape(root.config);
  const labelsShape = objectShape(root.labels);
  if (!configShape || !labelsShape) return null;
  return { configShape, labelsShape };
}
