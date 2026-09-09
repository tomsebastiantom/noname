import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import { nangoAdapterFromEnv } from "./adapters/nango";
import type { ProviderEventMapping } from "./provider-events";
import type { IntegrationOAuthPort, IntegrationsService } from "./ports";
import { registerIntegrationsCommsRoutes } from "./routes/comms";
import { registerIntegrationsLlmRoutes } from "./routes/llm";
import { registerIntegrationsNangoRoutes } from "./routes/nango";
import { startExtensionDeliveryWorker } from "./extension-dispatcher";
import { startProviderEventWorker } from "./provider-event-worker";
import { createIntegrationsService } from "./service";

export { createNangoAdapter, nangoAdapterFromEnv } from "./adapters/nango";
export type {
  IntegrationId,
  IntegrationsService,
  LlmIntegrationPublic,
  OAuthConnectionsPublic,
} from "./ports";
export { createIntegrationsService } from "./service";
export {
  createMachineEventMapping,
  createProviderEventRegistry,
  PROVIDER_EVENT_NORMALIZED,
  PROVIDER_EVENT_RECEIVED,
} from "./provider-events";
export type {
  NormalizedProviderEvent,
  ProviderEventMapping,
  ProviderForwardedEvent,
} from "./provider-events";
export { registerExtensionDispatcher, startExtensionDeliveryWorker } from "./extension-dispatcher";

export interface IntegrationsDomainDeps {
  secrets: SecretsService;
  tenantSettings: TenantSettingsService;
  oauth?: IntegrationOAuthPort | null;
  service?: IntegrationsService;
  providerEventMappings?: ProviderEventMapping[];
  providerEventMachines?: import("../machines/ports").MachineEngine;
}

export function createIntegrationsDomain(deps: IntegrationsDomainDeps) {
  const oauth = deps.oauth === undefined ? nangoAdapterFromEnv() : deps.oauth;

  const service =
    deps.service ??
    createIntegrationsService({
      secrets: deps.secrets,
      tenantSettings: deps.tenantSettings,
      oauth,
      providerEventMappings: deps.providerEventMappings,
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

  const deliveryWorker = startExtensionDeliveryWorker();

  const providerEventWorker = startProviderEventWorker({
    mappings: deps.providerEventMappings,
    machines: deps.providerEventMachines,
  });

  return { service, routes, oauth, deliveryWorker, providerEventWorker };
}
