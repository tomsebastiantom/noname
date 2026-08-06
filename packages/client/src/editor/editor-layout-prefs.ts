export type CanvasPreviewWidth = "full" | "tablet" | "mobile";

export type EditorLayoutPrefs = {
  paletteWidth: number;
  propsWidth: number;
  paletteOpen: boolean;
  /** Layer tree dock at bottom of left sidebar (blocks stay visible above). */
  layersOpen: boolean;
  propsOpen: boolean;
  /** Agent chat sidebar (right); mutually exclusive with propsOpen when toggled. */
  agentOpen: boolean;
  chromeOpen: boolean;
  canvasPreview: CanvasPreviewWidth;
  /** layoutDocumentId → ISO timestamp; agent chat before this is hidden */
  agentChatClearedAt: Record<string, string>;
};

export const EDITOR_LAYOUT_DEFAULTS: EditorLayoutPrefs = {
  paletteWidth: 224,
  propsWidth: 288,
  paletteOpen: true,
  layersOpen: false,
  propsOpen: true,
  agentOpen: false,
  chromeOpen: true,
  canvasPreview: "full",
  agentChatClearedAt: {},
};

export const EDITOR_LAYOUT_LIMITS = {
  paletteMin: 180,
  paletteMax: 420,
  propsMin: 220,
  propsMax: 480,
  canvasMin: 280,
};

type LegacyEditorLayoutPrefs = Partial<EditorLayoutPrefs> & {
  leftTab?: "blocks" | "layers";
};

function parseAgentChatClearedAtMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value;
    }
  }
  return out;
}

export function migrateLegacyLayoutPrefs(
  parsed: LegacyEditorLayoutPrefs,
): Partial<EditorLayoutPrefs> {
  let layersOpen = parsed.layersOpen;
  if (typeof layersOpen !== "boolean") {
    if (parsed.leftTab === "layers") layersOpen = true;
    else if (parsed.leftTab === "blocks") layersOpen = false;
    else layersOpen = EDITOR_LAYOUT_DEFAULTS.layersOpen;
  }

  let paletteOpen = parsed.paletteOpen;
  if (typeof paletteOpen !== "boolean") {
    paletteOpen = EDITOR_LAYOUT_DEFAULTS.paletteOpen;
  } else if (paletteOpen === false && parsed.leftTab === "layers") {
    // Legacy combined sidebar: layers tab still required the blocks panel slot open.
    paletteOpen = true;
  }

  return {
    paletteWidth: parsed.paletteWidth,
    propsWidth: parsed.propsWidth,
    paletteOpen,
    layersOpen,
    propsOpen: parsed.propsOpen,
    agentOpen: parsed.agentOpen,
    chromeOpen: parsed.chromeOpen,
    canvasPreview: parsed.canvasPreview,
    agentChatClearedAt: parseAgentChatClearedAtMap(parsed.agentChatClearedAt),
  };
}

export function normalizeLayoutPrefs(raw: unknown): EditorLayoutPrefs {
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? migrateLegacyLayoutPrefs(raw as LegacyEditorLayoutPrefs)
      : {};

  const result: EditorLayoutPrefs = {
    paletteWidth: clamp(
      typeof parsed.paletteWidth === "number"
        ? parsed.paletteWidth
        : EDITOR_LAYOUT_DEFAULTS.paletteWidth,
      EDITOR_LAYOUT_LIMITS.paletteMin,
      EDITOR_LAYOUT_LIMITS.paletteMax,
    ),
    propsWidth: clamp(
      typeof parsed.propsWidth === "number" ? parsed.propsWidth : EDITOR_LAYOUT_DEFAULTS.propsWidth,
      EDITOR_LAYOUT_LIMITS.propsMin,
      EDITOR_LAYOUT_LIMITS.propsMax,
    ),
    paletteOpen:
      typeof parsed.paletteOpen === "boolean"
        ? parsed.paletteOpen
        : EDITOR_LAYOUT_DEFAULTS.paletteOpen,
    layersOpen:
      typeof parsed.layersOpen === "boolean"
        ? parsed.layersOpen
        : EDITOR_LAYOUT_DEFAULTS.layersOpen,
    propsOpen:
      typeof parsed.propsOpen === "boolean" ? parsed.propsOpen : EDITOR_LAYOUT_DEFAULTS.propsOpen,
    agentOpen:
      typeof parsed.agentOpen === "boolean" ? parsed.agentOpen : EDITOR_LAYOUT_DEFAULTS.agentOpen,
    chromeOpen:
      typeof parsed.chromeOpen === "boolean"
        ? parsed.chromeOpen
        : EDITOR_LAYOUT_DEFAULTS.chromeOpen,
    canvasPreview:
      parsed.canvasPreview === "tablet" ||
      parsed.canvasPreview === "mobile" ||
      parsed.canvasPreview === "full"
        ? parsed.canvasPreview
        : EDITOR_LAYOUT_DEFAULTS.canvasPreview,
    agentChatClearedAt: parseAgentChatClearedAtMap(parsed.agentChatClearedAt),
  };

  if (result.agentOpen && result.propsOpen) {
    result.propsOpen = false;
  }

  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
