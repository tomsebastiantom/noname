import { activateEditorDevtools } from "./activate-editor-devtools";

activateEditorDevtools();

export { editorActionSchemas, editorComponentSchemas } from "./catalog-schemas";
export {
  EditorHost,
  EditPageView,
  editorComponents,
  editorRegistry,
  VisualEditorShell,
} from "./registry";
