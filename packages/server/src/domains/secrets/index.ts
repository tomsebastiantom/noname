import type { TenantSettingsService } from "../documents/ports";
import { createEnvFallbackSecretStore } from "./adapters/env-fallback";
import { createVaultSecretStore, vaultConfigFromEnv } from "./adapters/vault";
import type { SecretStorePort, VaultConfig } from "./ports";
import { createSecretsService } from "./service";

export { createEnvFallbackSecretStore } from "./adapters/env-fallback";
export { createVaultSecretStore, vaultConfigFromEnv } from "./adapters/vault";
export type { SecretStorePort, SecretsService, VaultConfig } from "./ports";
export { createSecretsService } from "./service";

export interface SecretsDomainDeps {
  store?: SecretStorePort;
  vault?: VaultConfig | null;
  tenantSettings?: TenantSettingsService;
}

export function createSecretsDomain(deps: SecretsDomainDeps = {}) {
  const store =
    deps.store ??
    (() => {
      const config = deps.vault ?? vaultConfigFromEnv();
      if (config) return createVaultSecretStore(config);
      console.warn("[secrets] VAULT_ADDR/VAULT_TOKEN not set — using env fallback (no org BYOK)");
      return createEnvFallbackSecretStore();
    })();

  const service = createSecretsService({
    store,
    tenantSettings: deps.tenantSettings,
  });

  return { service, store };
}
