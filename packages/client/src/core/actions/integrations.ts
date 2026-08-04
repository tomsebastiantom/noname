import {
  type CommsIntegrationState,
  type LlmIntegrationState,
  loadCommsIntegration,
  loadLlmIntegration,
  saveCommsIntegration,
  saveLlmIntegration,
} from "../../auth/integrations-settings";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type IntegrationsLlmLoaded = LlmIntegrationState & { loadedAt: number };
export type IntegrationsCommsLoaded = CommsIntegrationState & { loadedAt: number };

export const integrationsActions = {
  loadIntegrationsLlm: (async (_params, setState) => {
    setState(ADMIN_STATE.integrations.llm.loading, true);
    setState(ADMIN_STATE.integrations.llm.error, null);
    try {
      const loaded = await loadLlmIntegration();
      setState(ADMIN_STATE.integrations.llm.loaded, { ...loaded, loadedAt: Date.now() });
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.llm.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.llm.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.llm.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveIntegrationsLlm: (async (params, setState) => {
    const { provider, apiKey, allowPlatformFallback } = params as {
      provider: "openai" | "anthropic";
      apiKey?: string;
      allowPlatformFallback: boolean;
    };
    const loaded = await saveLlmIntegration({ provider, apiKey, allowPlatformFallback });
    setState(ADMIN_STATE.integrations.llm.loaded, { ...loaded, loadedAt: Date.now() });
  }) satisfies CatalogActionHandler,

  loadIntegrationsComms: (async (_params, setState) => {
    setState(ADMIN_STATE.integrations.comms.loading, true);
    setState(ADMIN_STATE.integrations.comms.error, null);
    try {
      const loaded = await loadCommsIntegration();
      setState(ADMIN_STATE.integrations.comms.loaded, { ...loaded, loadedAt: Date.now() });
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.comms.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.comms.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.comms.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveIntegrationsComms: (async (params, setState) => {
    const { emailProvider, apiKey, fromEmail, fromName } = params as {
      emailProvider: "resend" | "twilio";
      apiKey?: string;
      fromEmail?: string;
      fromName?: string;
    };
    const loaded = await saveCommsIntegration({ emailProvider, apiKey, fromEmail, fromName });
    setState(ADMIN_STATE.integrations.comms.loaded, { ...loaded, loadedAt: Date.now() });
  }) satisfies CatalogActionHandler,
};
