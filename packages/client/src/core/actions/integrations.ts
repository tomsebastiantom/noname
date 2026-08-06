import {
  type CommsIntegrationState,
  type LlmIntegrationState,
  loadCommsIntegration,
  loadLlmIntegration,
  loadOAuthConnections,
  type OAuthConnectionsState,
  saveCommsIntegration,
  saveLlmIntegration,
  startOAuthConnect,
} from "../../auth/integrations-settings";
import {
  loadCommsDeliveries,
  loadCommsInbox,
  markCommsInboxRead,
} from "../../auth/notifications-settings";
import {
  loadWebhookOutboundDeliveries,
  loadWebhookSubscriptions,
} from "../../auth/webhooks-settings";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type IntegrationsLlmLoaded = LlmIntegrationState & { loadedAt: number };
export type IntegrationsCommsLoaded = CommsIntegrationState & { loadedAt: number };
export type IntegrationsOAuthLoaded = OAuthConnectionsState & { loadedAt: number };

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
      emailProvider: "resend" | "ses" | "twilio";
      apiKey?: string;
      fromEmail?: string;
      fromName?: string;
    };
    const loaded = await saveCommsIntegration({ emailProvider, apiKey, fromEmail, fromName });
    setState(ADMIN_STATE.integrations.comms.loaded, { ...loaded, loadedAt: Date.now() });
  }) satisfies CatalogActionHandler,

  loadIntegrationsOAuth: (async (_params, setState) => {
    setState(ADMIN_STATE.integrations.oauth.loading, true);
    setState(ADMIN_STATE.integrations.oauth.error, null);
    try {
      const loaded = await loadOAuthConnections();
      setState(ADMIN_STATE.integrations.oauth.loaded, { ...loaded, loadedAt: Date.now() });
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.oauth.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.oauth.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.oauth.loading, false);
    }
  }) satisfies CatalogActionHandler,

  startIntegrationsOAuthConnect: (async (params, setState) => {
    const { integrationId } = params as { integrationId: string };
    const session = await startOAuthConnect(integrationId);
    if (typeof window !== "undefined" && session.connectLink) {
      window.open(session.connectLink, "_blank", "noopener,noreferrer");
    }
    const loaded = await loadOAuthConnections();
    setState(ADMIN_STATE.integrations.oauth.loaded, { ...loaded, loadedAt: Date.now() });
  }) satisfies CatalogActionHandler,

  loadCommsDeliveries: (async (params, setState) => {
    setState(ADMIN_STATE.integrations.commsDeliveries.loading, true);
    setState(ADMIN_STATE.integrations.commsDeliveries.error, null);
    try {
      const query = (params ?? {}) as { status?: string };
      const status = typeof query.status === "string" ? query.status : undefined;
      const rows = await loadCommsDeliveries({ status, limit: 50, includeEvents: true });
      setState(ADMIN_STATE.integrations.commsDeliveries.loaded, rows);
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.commsDeliveries.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.commsDeliveries.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.commsDeliveries.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadCommsInbox: (async (params, setState) => {
    setState(ADMIN_STATE.integrations.commsInbox.loading, true);
    setState(ADMIN_STATE.integrations.commsInbox.error, null);
    try {
      const query = (params ?? {}) as { unreadOnly?: boolean };
      const unreadOnly = query.unreadOnly === true;
      const rows = await loadCommsInbox({ unreadOnly, limit: 50 });
      setState(ADMIN_STATE.integrations.commsInbox.loaded, rows);
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.commsInbox.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.commsInbox.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.commsInbox.loading, false);
    }
  }) satisfies CatalogActionHandler,

  markCommsInboxRead: (async (params, setState) => {
    const itemId =
      typeof (params as { itemId?: unknown })?.itemId === "string"
        ? (params as { itemId: string }).itemId
        : "";
    if (!itemId) return;
    await markCommsInboxRead(itemId);
    const rows = await loadCommsInbox({ limit: 50 });
    setState(ADMIN_STATE.integrations.commsInbox.loaded, rows);
  }) satisfies CatalogActionHandler,

  loadWebhookSubscriptions: (async (_params, setState) => {
    setState(ADMIN_STATE.integrations.webhooks.loading, true);
    setState(ADMIN_STATE.integrations.webhooks.error, null);
    try {
      const rows = await loadWebhookSubscriptions();
      setState(ADMIN_STATE.integrations.webhooks.loaded, rows);
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.webhooks.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.webhooks.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.webhooks.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadWebhookOutboundDeliveries: (async (_params, setState) => {
    setState(ADMIN_STATE.integrations.webhookDeliveries.loading, true);
    setState(ADMIN_STATE.integrations.webhookDeliveries.error, null);
    try {
      const rows = await loadWebhookOutboundDeliveries(50);
      setState(ADMIN_STATE.integrations.webhookDeliveries.loaded, rows);
    } catch (err) {
      setState(
        ADMIN_STATE.integrations.webhookDeliveries.error,
        err instanceof Error ? err.message : String(err),
      );
      setState(ADMIN_STATE.integrations.webhookDeliveries.loaded, null);
    } finally {
      setState(ADMIN_STATE.integrations.webhookDeliveries.loading, false);
    }
  }) satisfies CatalogActionHandler,
};
