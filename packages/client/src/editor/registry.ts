import { defineCatalog } from "@json-render/core";
import { defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
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
export { EditorHost } from "./components/shell/EditorHost";
export { EditPageView } from "./components/shell/EditPageView";
export { SaveBar } from "./components/shell/SaveBar";
export { VisualEditorShell } from "./components/shell/VisualEditorShell";

const editorCatalog = defineCatalog(schema, {
  components: editorComponentSchemas,
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

export const { registry: editorRegistry } = defineRegistry(editorCatalog, {
  components: editorComponentMap,
  actions: {} as never,
});

/** json-render component map for a spec-driven visual editor shell. */
export const editorComponents = editorComponentMap;
