import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import type { IntegrationsService } from "./ports";
import { registerIntegrationsCommsRoutes } from "./routes/comms";
import { registerIntegrationsLlmRoutes } from "./routes/llm";
import { createIntegrationsService } from "./service";

export type { IntegrationsService, LlmIntegrationPublic } from "./ports";
export { createIntegrationsService } from "./service";

export interface IntegrationsDomainDeps {
  secrets: SecretsService;
  tenantSettings: TenantSettingsService;
  service?: IntegrationsService;
}

export function createIntegrationsDomain(deps: IntegrationsDomainDeps) {
  const service =
    deps.service ??
    createIntegrationsService({
      secrets: deps.secrets,
      tenantSettings: deps.tenantSettings,
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

  return { service, routes };
}
