import { sessionUserId } from "../auth/session";
import { apiFetch, apiFetchVoid } from "../lib/api";
import {
  EDITOR_LAYOUT_DEFAULTS,
  EDITOR_LAYOUT_LIMITS,
  type EditorLayoutPrefs,
  migrateLegacyLayoutPrefs,
  normalizeLayoutPrefs,
} from "./editor-layout-prefs";

/** Internal content type — one entry per editor user. */
export const EDITOR_PREFS_CONTENT_TYPE = "editor_prefs";

const LEGACY_LAYOUT_STORAGE_KEY = "noname-editor-layout-v1";

export type EditorPrefsData = {
  userId: string;
  palettePins: string[];
  layout: EditorLayoutPrefs;
  layersTreeCollapsed: Record<string, string[]>;
  /** layoutDocumentId → ISO timestamp; tasks at or before this are hidden in agent chat */
  agentChatClearedAt: Record<string, string>;
};

export type EditorPrefsLoadResult = EditorPrefsData & {
  migratedFromLegacy: boolean;
};

export const EDITOR_PREFS_DEFAULTS: Omit<EditorPrefsData, "userId"> = {
  palettePins: [],
  layout: { ...EDITOR_LAYOUT_DEFAULTS },
  layersTreeCollapsed: {},
  agentChatClearedAt: {},
};

interface EditorPrefsEntry {
  id: string;
  data: {
    userId?: string;
    palettePins?: unknown;
    layout?: unknown;
    layersTreeCollapsed?: unknown;
    agentChatClearedAt?: unknown;
  };
}

let cachedEntryId: string | null = null;
let cachedData: EditorPrefsData | null = null;

function parsePalettePins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string");
}

function parseAgentChatClearedAt(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value;
    }
  }
  return out;
}

function parseLayersTreeCollapsed(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((entry): entry is string => typeof entry === "string");
    }
  }
  return out;
}

function loadLegacyLayoutFromLocalStorage(): EditorLayoutPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeLayoutPrefs(migrateLegacyLayoutPrefs(parsed));
  } catch {
    return null;
  }
}

function clearLegacyLayoutLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function parseEditorPrefsData(
  userId: string,
  raw: EditorPrefsEntry["data"],
): EditorPrefsLoadResult {
  const layoutFromApi = raw.layout !== undefined ? normalizeLayoutPrefs(raw.layout) : null;
  const legacyLayout = layoutFromApi ? null : loadLegacyLayoutFromLocalStorage();
  const legacyTopLevelCleared = parseAgentChatClearedAt(raw.agentChatClearedAt);

  if (legacyLayout) {
    clearLegacyLayoutLocalStorage();
  }

  let layout = layoutFromApi ?? legacyLayout ?? { ...EDITOR_LAYOUT_DEFAULTS };
  if (Object.keys(legacyTopLevelCleared).length > 0) {
    layout = normalizeLayoutPrefs({
      ...layout,
      agentChatClearedAt: {
        ...legacyTopLevelCleared,
        ...layout.agentChatClearedAt,
      },
    });
  }

  return {
    userId,
    palettePins: parsePalettePins(raw.palettePins),
    layout,
    layersTreeCollapsed: parseLayersTreeCollapsed(raw.layersTreeCollapsed),
    agentChatClearedAt: layout.agentChatClearedAt,
    migratedFromLegacy: Boolean(legacyLayout) || Object.keys(legacyTopLevelCleared).length > 0,
  };
}

async function listEditorPrefsEntries(): Promise<EditorPrefsEntry[]> {
  const body = await apiFetch<{ data?: EditorPrefsEntry[] }>(
    `/api/documents/${encodeURIComponent(EDITOR_PREFS_CONTENT_TYPE)}`,
  );
  return body.data ?? [];
}

async function findPrefsEntryForUser(userId: string): Promise<EditorPrefsEntry | null> {
  const rows = await listEditorPrefsEntries();
  return rows.find((row) => row.data.userId === userId) ?? null;
}

/** Load all editor prefs for the signed-in user. */
export async function loadEditorPrefsFromApi(): Promise<EditorPrefsLoadResult | null> {
  const userId = sessionUserId();
  if (!userId) return null;

  const entry = await findPrefsEntryForUser(userId);
  if (!entry) {
    cachedEntryId = null;
    cachedData = null;
    const legacyLayout = loadLegacyLayoutFromLocalStorage();
    if (legacyLayout) clearLegacyLayoutLocalStorage();
    return {
      userId,
      ...EDITOR_PREFS_DEFAULTS,
      layout: legacyLayout ?? { ...EDITOR_LAYOUT_DEFAULTS },
      migratedFromLegacy: Boolean(legacyLayout),
    };
  }

  cachedEntryId = entry.id;
  const parsed = parseEditorPrefsData(userId, entry.data);
  cachedData = {
    userId: parsed.userId,
    palettePins: parsed.palettePins,
    layout: parsed.layout,
    layersTreeCollapsed: parsed.layersTreeCollapsed,
    agentChatClearedAt: parsed.agentChatClearedAt,
  };
  return parsed;
}

async function ensurePrefsEntry(userId: string): Promise<string> {
  if (cachedEntryId) return cachedEntryId;

  const existing = await findPrefsEntryForUser(userId);
  if (existing) {
    cachedEntryId = existing.id;
    return existing.id;
  }

  const created = await apiFetch<{ data?: { id: string } }>(
    `/api/documents/${encodeURIComponent(EDITOR_PREFS_CONTENT_TYPE)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        palettePins: [],
        layout: EDITOR_LAYOUT_DEFAULTS,
        layersTreeCollapsed: {},
        agentChatClearedAt: {},
      }),
    },
  );
  const id = created.data?.id;
  if (!id) throw new Error("Editor prefs entry was not created");
  cachedEntryId = id;
  return id;
}

export type EditorPrefsPatch = Partial<
  Pick<EditorPrefsData, "palettePins" | "layout" | "layersTreeCollapsed">
>;

/** Persist editor prefs (merged server-side with existing entry fields). */
export async function saveEditorPrefsToApi(patch: EditorPrefsPatch): Promise<void> {
  const userId = sessionUserId();
  if (!userId) return;

  const id = await ensurePrefsEntry(userId);
  const body: Record<string, unknown> = {};

  if (patch.palettePins !== undefined) {
    body.palettePins = patch.palettePins;
  }
  if (patch.layout !== undefined) {
    body.layout = normalizeLayoutPrefs(patch.layout);
  }
  if (patch.layersTreeCollapsed !== undefined) {
    body.layersTreeCollapsed = patch.layersTreeCollapsed;
  }

  if (Object.keys(body).length === 0) return;

  await apiFetchVoid(`/api/documents/${encodeURIComponent(EDITOR_PREFS_CONTENT_TYPE)}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (cachedData) {
    cachedData = {
      ...cachedData,
      ...patch,
      layout: patch.layout ? normalizeLayoutPrefs(patch.layout) : cachedData.layout,
    };
  }
}

/** @deprecated Use loadEditorPrefsFromApi */
export async function loadPalettePinsFromApi(): Promise<string[]> {
  const prefs = await loadEditorPrefsFromApi();
  return prefs?.palettePins ?? [];
}

/** @deprecated Use saveEditorPrefsToApi */
export async function savePalettePinsToApi(pinnedTypes: string[]): Promise<void> {
  await saveEditorPrefsToApi({ palettePins: pinnedTypes });
}

export { EDITOR_LAYOUT_LIMITS };
