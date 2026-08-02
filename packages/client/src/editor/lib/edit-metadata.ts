import type { ComponentRegistry } from "@json-render/react";
import type { z } from "zod";
import {
  EDITOR_COMPONENT_OVERRIDES,
  type EditorComponentOverride,
  PALETTE_EXCLUDED_TYPES,
} from "./editor-overrides";
import { isHiddenEditorField } from "./field-filter";
import {
  defaultsFromZodShape,
  fieldsFromZodShape,
  parseCatalogPropsSchema,
} from "./schema-introspect";
import { storefrontComponentSchemas } from "./storefront-schemas";
import type { EditComponentMeta, PaletteCatalog, PaletteItem } from "./types";

export { PALETTE_EXCLUDED_TYPES } from "./editor-overrides";

type SchemaEntry = {
  props: z.ZodType;
  description?: string;
};

const metaCache = new Map<string, EditComponentMeta | null>();

function applyConfigStateBindings(
  config: Record<string, unknown>,
  bindings: Record<string, string> | undefined,
): Record<string, unknown> {
  if (!bindings) return config;
  const next = { ...config };
  for (const [key, stateKey] of Object.entries(bindings)) {
    if (key in next) {
      next[key] = { $state: stateKey };
    }
  }
  return next;
}

function buildEditMeta(
  componentType: string,
  entry: SchemaEntry,
  override: EditorComponentOverride | undefined,
): EditComponentMeta | null {
  const parsed = parseCatalogPropsSchema(entry.props);
  if (!parsed) return null;

  const config = defaultsFromZodShape(parsed.configShape, override?.seedConfig);
  const labels = defaultsFromZodShape(parsed.labelsShape, override?.seedLabels);

  const fields = [
    ...fieldsFromZodShape("labels", parsed.labelsShape),
    ...fieldsFromZodShape("config", parsed.configShape),
  ].filter((field) => {
    if (isHiddenEditorField(field.path)) return false;
    if (override?.hiddenFields?.includes(field.path)) return false;
    return true;
  });

  if (fields.length === 0) return null;

  return {
    label: override?.label ?? componentType,
    preferredParentType: override?.preferredParentType,
    defaultProps: {
      config: applyConfigStateBindings(config, override?.configStateBindings),
      labels,
    },
    fields,
  };
}

function schemaEntryForType(componentType: string): SchemaEntry | undefined {
  return storefrontComponentSchemas[componentType];
}

export function editMetaForType(componentType: string): EditComponentMeta | null {
  if (metaCache.has(componentType)) {
    return metaCache.get(componentType) ?? null;
  }

  const entry = schemaEntryForType(componentType);
  if (!entry) {
    metaCache.set(componentType, null);
    return null;
  }

  const meta = buildEditMeta(componentType, entry, EDITOR_COMPONENT_OVERRIDES[componentType]);
  metaCache.set(componentType, meta);
  return meta;
}

function toPaletteItem(componentType: string): PaletteItem {
  const meta = editMetaForType(componentType);
  const entry = schemaEntryForType(componentType);
  return {
    componentType,
    label: meta?.label ?? componentType,
    description: entry?.description,
    configured: meta?.defaultProps !== undefined,
  };
}

/** Build palette from live registry — pinned shortcuts + searchable catalog. */
export function paletteCatalogForRegistry(
  registry: ComponentRegistry,
  pinnedTypes: readonly string[] = [],
): PaletteCatalog {
  const pinned: PaletteItem[] = [];
  const pinnedSet = new Set<string>();

  for (const type of pinnedTypes) {
    if (pinnedSet.has(type)) continue;
    if (!registry[type] || PALETTE_EXCLUDED_TYPES.has(type)) continue;
    pinnedSet.add(type);
    pinned.push(toPaletteItem(type));
  }

  const blocks: PaletteItem[] = Object.keys(registry)
    .filter((type) => !PALETTE_EXCLUDED_TYPES.has(type) && !pinnedSet.has(type))
    .sort((a, b) => toPaletteItem(a).label.localeCompare(toPaletteItem(b).label))
    .map(toPaletteItem);

  return { pinned, blocks };
}

/** @deprecated Use paletteCatalogForRegistry */
export function paletteItemsForRegistry(registry: ComponentRegistry): PaletteItem[] {
  const { pinned, blocks } = paletteCatalogForRegistry(registry);
  return [...pinned, ...blocks];
}
