import type { Spec } from "@json-render/core";

export type EditFieldType =
  | "text"
  | "longText"
  | "number"
  | "enum"
  | "boolean"
  | "media"
  | "reference"
  | "action";

export type EditFieldDef = {
  path: string;
  label: string;
  type: EditFieldType;
  enumOptions?: string[];
  actionOptions?: { id: string; label: string }[];
  referenceType?: string;
};

export type EditComponentMeta = {
  label: string;
  fields: EditFieldDef[];
  /** Default props for palette "Add" — config + labels per props-contract */
  defaultProps?: { config: Record<string, unknown>; labels: Record<string, unknown> };
  /** Insert under this parent element type when adding (first match in tree) */
  preferredParentType?: string;
};

export type EditSelection = {
  elementId: string;
  componentType: string;
};

/** Block dropped/placed on canvas but not committed to layout until Save draft. */
export type PendingBlockAdd = {
  componentType: string;
  tempElementId: string;
  parentId?: string;
  insertIndex?: number;
  props: { config: Record<string, unknown>; labels: Record<string, unknown> };
};

export type LayoutDraft = {
  layoutId: string;
  templateName: string;
  segment: string;
  contentRef: string | null;
  status: string;
  storedSpec: Spec;
  updatedAt: string;
};

export type PaletteItem = {
  componentType: string;
  label: string;
  /** Catalog schema blurb — shown in tooltips, not on the button face. */
  description?: string;
  /** False when type is in registry but lacks editor defaultProps yet. */
  configured: boolean;
};

export type PaletteCatalog = {
  pinned: PaletteItem[];
  blocks: PaletteItem[];
};

/** Drag payload from palette → canvas (HTML5 DnD). */
export const EDITOR_DRAG_MIME = "application/x-noname-component";

/** Same payload — palette → pinned zone (read on drop). */
export const PALETTE_DRAG_MIME = "application/x-noname-palette-item";
