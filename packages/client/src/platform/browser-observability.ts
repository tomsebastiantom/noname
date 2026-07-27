import { init, type BrowserSDK } from "@noname/browser-sdk";
import { resolveOrgIdFromHostname } from "../auth/org";
import { apiHeaders } from "../auth/session";

let sdk: BrowserSDK | null = null;

export interface ObservabilityContext {
  schemaId?: string | null;
  variantId?: string | null;
  contextHash: string;
}

/** Wire @noname/browser-sdk once per page load (host concern — not json-render catalog). */
export async function initBrowserObservability(): Promise<void> {
  if (sdk || typeof window === "undefined") return;

  const orgId = await resolveOrgIdFromHostname(window.location.hostname);
  if (!orgId) return;

  const getHeaders = (): Record<string, string> => {
    const auth = apiHeaders() as Record<string, string>;
    return { "x-org-id": orgId, ...auth };
  };

  try {
    sdk = await init({
      orgId,
      getHeaders,
      privacy: { respectDNT: false },
      replay: { sampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1 },
      trace: { propagateFetch: true },
    });
  } catch {
    // Unavailable in SSR, bots, or when privacy blocks init.
  }
}

/** Push edge attribution into analytics + re-evaluate flags for the visitor segment. */
export async function syncBrowserObservabilityContext(
  context: ObservabilityContext,
): Promise<void> {
  if (!sdk) return;

  sdk.analytics.setContext(
    context.schemaId ?? "",
    context.variantId ?? "",
    context.contextHash,
  );
  await sdk.flags.evaluate();
  sdk.analytics.pageView();
}

export function getBrowserSdk(): BrowserSDK | null {
  return sdk;
}
