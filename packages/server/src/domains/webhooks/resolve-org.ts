import type { TenantSettingsService } from "../documents/ports";

export function createWebhookOrgResolver(
  tenantSettings: Pick<TenantSettingsService, "findOrgIdByOAuthConnectionId">,
) {
  return async (input: {
    orgId?: string;
    connectionId?: string;
    provider: string;
  }): Promise<string | null> => {
    void input.provider;
    if (input.orgId?.trim()) return input.orgId.trim();
    const connectionId = input.connectionId?.trim();
    if (!connectionId) return null;
    return tenantSettings.findOrgIdByOAuthConnectionId(connectionId);
  };
}
