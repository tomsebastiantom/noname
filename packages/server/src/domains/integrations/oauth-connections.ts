import type { TenantIntegrations } from "../documents/ports";
import type { IntegrationCatalogEntry, OAuthConnectionPublic } from "./ports";

type ConnectionMap = Record<string, { connectionId: string }>;

/** Reads stored OAuth connection pointers; merges legacy per-vendor fields if present. */
export function readOAuthConnectionMap(integrations: TenantIntegrations): ConnectionMap {
  const raw = integrations as TenantIntegrations & {
    stripe?: { connectionId?: string };
    googleMail?: { connectionId?: string };
  };

  const out: ConnectionMap = {};
  for (const [integrationId, row] of Object.entries(raw.nango ?? {})) {
    const connectionId = row?.connectionId?.trim();
    if (connectionId) out[integrationId] = { connectionId };
  }

  if (raw.stripe?.connectionId?.trim() && !out.stripe) {
    out.stripe = { connectionId: raw.stripe.connectionId.trim() };
  }
  if (raw.googleMail?.connectionId?.trim() && !out["google-mail"]) {
    out["google-mail"] = { connectionId: raw.googleMail.connectionId.trim() };
  }

  return out;
}

export function mergeOAuthConnections(
  catalog: IntegrationCatalogEntry[],
  stored: ConnectionMap,
): OAuthConnectionPublic[] {
  const rows = new Map<string, OAuthConnectionPublic>();

  for (const entry of catalog) {
    const connectionId = stored[entry.integrationId]?.connectionId;
    rows.set(entry.integrationId, {
      ...entry,
      connected: Boolean(connectionId),
      connectionId,
    });
  }

  for (const [integrationId, row] of Object.entries(stored)) {
    if (rows.has(integrationId)) continue;
    rows.set(integrationId, {
      integrationId,
      connected: true,
      connectionId: row.connectionId,
    });
  }

  return [...rows.values()].sort((a, b) =>
    (a.displayName ?? a.integrationId).localeCompare(b.displayName ?? b.integrationId),
  );
}
