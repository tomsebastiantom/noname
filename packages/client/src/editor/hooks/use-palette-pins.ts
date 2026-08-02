import type { ComponentRegistry } from "@json-render/react";
import { useEditorPrefs } from "./use-editor-prefs";

/** Palette pin state from unified editor_prefs (cross-device). */
export function usePalettePins(registry: ComponentRegistry) {
  const { pinnedTypes, pin, unpin, ready } = useEditorPrefs();
  void registry;
  return { pinnedTypes, pin, unpin, ready };
}
