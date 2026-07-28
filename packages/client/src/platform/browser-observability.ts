import { type BrowserSDK, init } from "@noname/browser-sdk";
import { resolveOrgIdFromHostname } from "../auth/org";
import {
  apiHeaders,
  hydrateTokenFromCookie,
  sessionUserEmail,
  sessionUserId,
} from "../auth/session";

let sdk: BrowserSDK | null = null;
let flagsSnapshot: Record<string, unknown> = {};
const flagListeners = new Set<() => void>();
const layoutRefreshListeners = new Set<() => void>();

let layoutFlagKeys = new Set<string>();
let flagBridgeInstalled = false;
let layoutRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const LAYOUT_REFRESH_DEBOUNCE_MS = 400;

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";
}

export interface ObservabilityContext {
  schemaId?: string | null;
  variantId?: string | null;
  contextHash: string;
}

function emitFlagsChanged(): void {
  for (const listener of flagListeners) {
    listener();
  }
}

function syncFlagsFromSdk(): void {
  if (!sdk) return;
  flagsSnapshot = sdk.flags.getAll();
  emitFlagsChanged();
}

function scheduleLayoutRefresh(key: string): void {
  if (!layoutFlagKeys.has(key)) return;
  if (layoutRefreshTimer) clearTimeout(layoutRefreshTimer);
  layoutRefreshTimer = setTimeout(() => {
    layoutRefreshTimer = null;
    for (const listener of layoutRefreshListeners) {
      listener();
    }
  }, LAYOUT_REFRESH_DEBOUNCE_MS);
}

function installFlagBridge(): void {
  if (!sdk || flagBridgeInstalled) return;
  flagBridgeInstalled = true;
  sdk.flags.onAnyUpdate((key) => {
    syncFlagsFromSdk();
    scheduleLayoutRefresh(key);
  });
}

async function loadLayoutFlagKeys(orgId: string): Promise<void> {
  try {
    const auth = apiHeaders() as Record<string, string>;
    const res = await fetch("/api/flags", {
      headers: { "x-org-id": orgId, ...auth },
    });
    if (!res.ok) return;

    const body = (await res.json()) as {
      data?: Array<{ key: string; schemaId: string | null; variantId: string | null }>;
    };
    const keys = new Set<string>();
    for (const flag of body.data ?? []) {
      if (flag.schemaId || flag.variantId) {
        keys.add(flag.key);
      }
    }
    layoutFlagKeys = keys;
  } catch {
    // Layout-bound keys are best-effort — fall back to expression-only updates.
  }
}

/** Wire @noname/browser-sdk once per page load (host concern — not json-render catalog). */
let initPromise: Promise<void> | null = null;

export function initBrowserObservability(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (sdk || typeof window === "undefined") return;

    const orgId = await resolveOrgIdFromHostname(window.location.hostname);
    if (!orgId) return;

    const getHeaders = (): Record<string, string> => {
      const auth = apiHeaders() as Record<string, string>;
      return { "x-org-id": orgId, ...auth };
    };

    try {
      sdk = await init({
        getHeaders,
        privacy: { respectDNT: false },
        replay: { sampleRate: isLocalDevHost() ? 1 : 0 },
        trace: { propagateFetch: true },
      });
      installFlagBridge();
      void loadLayoutFlagKeys(orgId);
      syncObservabilityUserFromSession();
    } catch {
      // Unavailable in SSR, bots, or when privacy blocks init.
    }
  })();

  return initPromise;
}

/** Link JWT account to SDK events/errors after login or on page load. */
export function syncObservabilityUserFromSession(): void {
  if (!sdk) return;
  hydrateTokenFromCookie();
  const userId = sessionUserId();
  if (!userId) {
    sdk.clearUser();
    return;
  }
  const email = sessionUserEmail();
  sdk.setUser(email ? { id: userId, email } : { id: userId });
}

/** Drop account attribution on logout. */
export function clearObservabilityUser(): void {
  sdk?.clearUser();
}

/** Push edge attribution into analytics + re-evaluate flags for the visitor segment. */
export async function syncBrowserObservabilityContext(
  context: ObservabilityContext,
  edgeFlags?: Record<string, unknown>,
): Promise<void> {
  if (!sdk) return;

  sdk.analytics.setContext(context.schemaId ?? "", context.variantId ?? "", context.contextHash);

  if (edgeFlags) {
    sdk.flags.seed(edgeFlags);
    flagsSnapshot = { ...flagsSnapshot, ...edgeFlags };
    emitFlagsChanged();
  }

  await sdk.flags.evaluate();
  syncFlagsFromSdk();
  sdk.analytics.pageView();
}

/** Subscribe to live flag snapshots for json-render `$state` paths under `/flags/*`. */
export function subscribeFlags(listener: () => void): () => void {
  flagListeners.add(listener);
  return () => {
    flagListeners.delete(listener);
  };
}

export function getFlagsSnapshot(): Record<string, unknown> {
  return flagsSnapshot;
}

/** Debounced edge schema refresh when layout-bound flags change (schemaId / variantId). */
export function subscribeFlagLayoutRefresh(listener: () => void): () => void {
  layoutRefreshListeners.add(listener);
  return () => {
    layoutRefreshListeners.delete(listener);
  };
}

export function getBrowserSdk(): BrowserSDK | null {
  return sdk;
}
