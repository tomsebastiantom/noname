import type { ComponentRegistry } from "@json-render/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EDITOR_LAYOUT_DEFAULTS,
  type EditorLayoutPrefs,
  normalizeLayoutPrefs,
} from "../editor-layout-prefs";
import { loadEditorPrefsFromApi, saveEditorPrefsToApi } from "../editor-prefs-api";
import { PALETTE_EXCLUDED_TYPES } from "../lib/edit-metadata";
import { pinComponentType, unpinComponentType } from "../palette-pins";

const SAVE_DEBOUNCE_MS = 400;

type EditorPrefsContextValue = {
  ready: boolean;
  layout: EditorLayoutPrefs;
  setLayout: (value: EditorLayoutPrefs | ((prev: EditorLayoutPrefs) => EditorLayoutPrefs)) => void;
  pinnedTypes: string[];
  pin: (componentType: string) => void;
  unpin: (componentType: string) => void;
  layersTreeCollapsed: ReadonlySet<string>;
  toggleLayerCollapsed: (elementId: string) => void;
};

const EditorPrefsContext = createContext<EditorPrefsContextValue | null>(null);

function filterPinsForRegistry(pins: string[], registry: ComponentRegistry): string[] {
  return pins.filter((type) => registry[type] !== undefined && !PALETTE_EXCLUDED_TYPES.has(type));
}

function collapsedSetForTemplate(
  layersTreeCollapsed: Record<string, string[]>,
  templateName: string,
): Set<string> {
  return new Set(layersTreeCollapsed[templateName] ?? []);
}

function collapsedRecordForTemplate(
  layersTreeCollapsed: Record<string, string[]>,
  templateName: string,
  collapsed: Set<string>,
): Record<string, string[]> {
  return {
    ...layersTreeCollapsed,
    [templateName]: [...collapsed],
  };
}

export function EditorPrefsProvider({
  templateName,
  registry,
  children,
}: Readonly<{
  templateName: string;
  registry: ComponentRegistry;
  children: ReactNode;
}>) {
  const [ready, setReady] = useState(false);
  const [palettePins, setPalettePins] = useState<string[]>([]);
  const [layout, setLayoutState] = useState<EditorLayoutPrefs>({ ...EDITOR_LAYOUT_DEFAULTS });
  const [layersTreeCollapsed, setLayersTreeCollapsed] = useState<Record<string, string[]>>(
    () => ({}),
  );

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const loaded = await loadEditorPrefsFromApi();
        if (cancelled) return;

        hydratedRef.current = false;

        if (loaded) {
          setPalettePins(filterPinsForRegistry(loaded.palettePins, registry));
          setLayoutState(normalizeLayoutPrefs(loaded.layout));
          setLayersTreeCollapsed(loaded.layersTreeCollapsed);
          if (loaded.migratedFromLegacy) {
            void saveEditorPrefsToApi({
              palettePins: filterPinsForRegistry(loaded.palettePins, registry),
              layout: normalizeLayoutPrefs(loaded.layout),
              layersTreeCollapsed: loaded.layersTreeCollapsed,
            }).catch(() => {});
          }
        } else {
          setPalettePins([]);
          setLayoutState({ ...EDITOR_LAYOUT_DEFAULTS });
          setLayersTreeCollapsed({});
        }
      } catch {
        if (!cancelled) {
          setPalettePins([]);
          setLayoutState({ ...EDITOR_LAYOUT_DEFAULTS });
          setLayersTreeCollapsed({});
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registry]);

  useEffect(() => {
    if (!ready) return;
    setPalettePins((prev) => {
      const next = filterPinsForRegistry(prev, registry);
      if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [registry, ready]);

  useEffect(() => {
    if (!ready) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveEditorPrefsToApi({
        palettePins,
        layout,
        layersTreeCollapsed,
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [palettePins, layout, layersTreeCollapsed, ready]);

  const setLayout = useCallback(
    (value: EditorLayoutPrefs | ((prev: EditorLayoutPrefs) => EditorLayoutPrefs)) => {
      setLayoutState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        return normalizeLayoutPrefs(next);
      });
    },
    [],
  );

  const pin = useCallback((componentType: string) => {
    setPalettePins((prev) => pinComponentType(prev, componentType));
  }, []);

  const unpin = useCallback((componentType: string) => {
    setPalettePins((prev) => unpinComponentType(prev, componentType));
  }, []);

  const collapsedForTemplate = useMemo(
    () => collapsedSetForTemplate(layersTreeCollapsed, templateName),
    [layersTreeCollapsed, templateName],
  );

  const toggleLayerCollapsed = useCallback(
    (elementId: string) => {
      setLayersTreeCollapsed((current) => {
        const collapsed = collapsedSetForTemplate(current, templateName);
        if (collapsed.has(elementId)) collapsed.delete(elementId);
        else collapsed.add(elementId);
        return collapsedRecordForTemplate(current, templateName, collapsed);
      });
    },
    [templateName],
  );

  const value = useMemo<EditorPrefsContextValue>(
    () => ({
      ready,
      layout,
      setLayout,
      pinnedTypes: palettePins,
      pin,
      unpin,
      layersTreeCollapsed: collapsedForTemplate,
      toggleLayerCollapsed,
    }),
    [ready, layout, setLayout, palettePins, pin, unpin, collapsedForTemplate, toggleLayerCollapsed],
  );

  return <EditorPrefsContext.Provider value={value}>{children}</EditorPrefsContext.Provider>;
}

export function useEditorPrefs(): EditorPrefsContextValue {
  const ctx = useContext(EditorPrefsContext);
  if (!ctx) {
    throw new Error("useEditorPrefs must be used within EditorPrefsProvider");
  }
  return ctx;
}

export function useEditorPrefsLayout(): Pick<
  EditorPrefsContextValue,
  "layout" | "setLayout" | "ready"
> {
  return useEditorPrefs();
}
