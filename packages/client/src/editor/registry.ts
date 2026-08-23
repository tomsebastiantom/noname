import { defineCatalog } from "@json-render/core";
import { defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { shadcnComponents } from "@json-render/shadcn";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { SaveBar } from "./components/shell/SaveBar";
import {
  EditorCanvasSlot,
  EditorLayerTreeSlot,
  EditorPaletteSlot,
  EditorPropsPanelSlot,
  VisualEditorShell,
} from "./components/shell/VisualEditorShell";
import { editorActionSchemas } from "./schemas/actions";
import { editorComponentSchemas } from "./schemas/components";

export { EditorCanvas } from "./components/canvas/EditorCanvas";
export { ComponentPalette } from "./components/palette/ComponentPalette";
export { PropsPanel } from "./components/panel/PropsPanel";
export { EditPageView } from "./components/shell/EditPageView";
export { SaveBar } from "./components/shell/SaveBar";
export { VisualEditorShell } from "./components/shell/VisualEditorShell";

import { editorActionHandlers } from "./actions";

const editorCatalog = defineCatalog(schema, {
  components: { ...editorComponentSchemas, ...shadcnComponentDefinitions },
  actions: editorActionSchemas,
});

const editorComponentMap = {
  VisualEditorShell,
  EditorSaveBar: SaveBar,
  EditorPalette: EditorPaletteSlot,
  EditorLayerTree: EditorLayerTreeSlot,
  EditorCanvas: EditorCanvasSlot,
  EditorPropsPanel: EditorPropsPanelSlot,
};

export const { registry: editorRegistry, handlers: editorHandlers } = defineRegistry(
  editorCatalog,
  {
    components: { ...editorComponentMap, ...shadcnComponents },
    actions: editorActionHandlers as never,
  },
);

/** json-render component map for a spec-driven visual editor shell. */
export const editorComponents = editorComponentMap;
