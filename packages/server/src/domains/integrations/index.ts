import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import { nangoAdapterFromEnv } from "./adapters/nango";
import type { IntegrationOAuthPort, IntegrationsService } from "./ports";
import { registerIntegrationsCommsRoutes } from "./routes/comms";
import { registerIntegrationsLlmRoutes } from "./routes/llm";
import { registerIntegrationsNangoRoutes } from "./routes/nango";
import { createIntegrationsService } from "./service";

export { createNangoAdapter, nangoAdapterFromEnv } from "./adapters/nango";
export type {
  IntegrationId,
  IntegrationsService,
  LlmIntegrationPublic,
  OAuthConnectionsPublic,
} from "./ports";
export { createIntegrationsService } from "./service";

export interface IntegrationsDomainDeps {
  secrets: SecretsService;
  tenantSettings: TenantSettingsService;
  oauth?: IntegrationOAuthPort | null;
  service?: IntegrationsService;
}

export function createIntegrationsDomain(deps: IntegrationsDomainDeps) {
  const oauth = deps.oauth === undefined ? nangoAdapterFromEnv() : deps.oauth;

  const service =
    deps.service ??
    createIntegrationsService({
      secrets: deps.secrets,
      tenantSettings: deps.tenantSettings,
      oauth,
    });

  const routes = new Hono();
  registerIntegrationsLlmRoutes(routes, {
    service,
    tenantSettings: deps.tenantSettings,
  });
  registerIntegrationsCommsRoutes(routes, {
    service,
    tenantSettings: deps.tenantSettings,
  });
  registerIntegrationsNangoRoutes(routes, {
    service,
    tenantSettings: deps.tenantSettings,
    oauth,
  });

  return { service, routes, oauth };
}
