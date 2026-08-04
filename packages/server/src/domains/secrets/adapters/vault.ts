import type { GetOrgSecretInput, PutOrgSecretInput, SecretStorePort, VaultConfig } from "../ports";

function orgPath(prefix: string, orgId: string, kind: string, provider: string): string {
  return `${prefix}/orgs/${orgId}/${kind}/${provider}`;
}

function platformPath(prefix: string, name: string): string {
  return `${prefix}/platform/${name}`;
}

function dataUrl(config: VaultConfig, logicalPath: string): string {
  const base = config.addr.replace(/\/$/, "");
  return `${base}/v1/${config.mount}/data/${logicalPath}`;
}

async function vaultFetch(
  config: VaultConfig,
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "X-Vault-Token": config.token,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return null;
  }
}

export function createVaultSecretStore(config: VaultConfig): SecretStorePort {
  return {
    async putOrgSecret(input: PutOrgSecretInput): Promise<void> {
      const path = orgPath(config.pathPrefix, input.orgId, input.kind, input.provider);
      const response = await vaultFetch(config, dataUrl(config, path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: input.payload }),
      });
      if (!response?.ok) {
        const detail = response ? await response.text() : "Vault unreachable";
        throw new Error(`Vault put failed (${path}): ${detail}`);
      }
    },

    async getOrgSecret(input: GetOrgSecretInput): Promise<Record<string, string> | null> {
      const path = orgPath(config.pathPrefix, input.orgId, input.kind, input.provider);
      const response = await vaultFetch(config, dataUrl(config, path));
      if (!response || response.status === 404) return null;
      if (!response.ok) return null;

      const body = (await response.json()) as {
        data?: { data?: Record<string, string> };
      };
      return body.data?.data ?? null;
    },

    async hasOrgSecret(orgId, kind, provider): Promise<boolean> {
      const secret = await this.getOrgSecret({ orgId, kind, provider });
      return secret !== null && Object.keys(secret).length > 0;
    },

    async getPlatformSecret(name: string): Promise<string | null> {
      const path = platformPath(config.pathPrefix, name);
      const response = await vaultFetch(config, dataUrl(config, path));
      if (!response || response.status === 404) return null;
      if (!response.ok) return null;

      const body = (await response.json()) as {
        data?: { data?: Record<string, string> };
      };
      const data = body.data?.data;
      if (!data) return null;
      return data.value ?? data.apiKey ?? null;
    },
  };
}

export function vaultConfigFromEnv(): VaultConfig | null {
  const addr = process.env.VAULT_ADDR;
  const token = process.env.VAULT_TOKEN;
  if (!addr || !token) return null;

  return {
    addr,
    token,
    mount: process.env.VAULT_MOUNT ?? "secret",
    pathPrefix: process.env.VAULT_PATH_PREFIX ?? "noname",
  };
}
