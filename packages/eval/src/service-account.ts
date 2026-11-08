import { createSign } from "node:crypto";

export type ServiceAccountKey = {
  type?: string;
  keyId: string;
  userId: string;
  key: string;
};

export type VaultConfig = {
  addr: string;
  token: string;
  mount: string;
  pathPrefix: string;
};

const cache = new Map<string, { accessToken: string; userId: string; expiresAt: number }>();

export function vaultConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VaultConfig | null {
  const addr = env.VAULT_ADDR?.trim();
  const token = env.VAULT_TOKEN?.trim();
  if (!addr || !token) return null;
  return {
    addr,
    token,
    mount: env.VAULT_MOUNT?.trim() || "secret",
    pathPrefix: env.VAULT_PATH_PREFIX?.trim() || "noname",
  };
}

function tenantEvalPath(config: VaultConfig, orgId: string): string {
  return `${config.pathPrefix}/orgs/${orgId}/eval/service-account`;
}

function vaultUrl(config: VaultConfig, logicalPath: string): string {
  return `${config.addr.replace(/\/$/, "")}/v1/${config.mount}/data/${logicalPath}`;
}

/** Read the tenant's eval service-account key from Vault. No filesystem fallback. */
export async function readTenantEvalKey(
  orgId: string,
  config: VaultConfig | null = vaultConfigFromEnv(),
): Promise<ServiceAccountKey> {
  if (!config) {
    throw new Error("VAULT_ADDR and VAULT_TOKEN are required to load a tenant eval key");
  }
  const path = tenantEvalPath(config, orgId);
  const response = await fetch(vaultUrl(config, path), {
    headers: { "X-Vault-Token": config.token },
  });
  if (!response.ok) {
    throw new Error(`Vault read failed for ${path} (${response.status})`);
  }
  const body = (await response.json()) as { data?: { data?: Record<string, string> } };
  const serialized = body.data?.data?.key;
  if (!serialized) throw new Error(`Vault secret ${path} has no key`);
  return JSON.parse(serialized) as ServiceAccountKey;
}

/** Write the tenant's eval service-account key to Vault. Used by provisioning only. */
export async function writeTenantEvalKey(
  orgId: string,
  key: ServiceAccountKey,
  config: VaultConfig | null = vaultConfigFromEnv(),
): Promise<void> {
  if (!config) {
    throw new Error("VAULT_ADDR and VAULT_TOKEN are required to store a tenant eval key");
  }
  const path = tenantEvalPath(config, orgId);
  const response = await fetch(vaultUrl(config, path), {
    method: "POST",
    headers: { "X-Vault-Token": config.token, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { key: JSON.stringify(key) } }),
  });
  if (!response.ok) {
    throw new Error(`Vault write failed for ${path} (${response.status})`);
  }
}

/**
 * Exchange a service-account key for a short-lived ZITADEL access token (RFC 7523 private-key JWT).
 * The key comes from Vault; no shared secret and no `nsv.` token.
 */
export async function createServiceAccountToken(options: {
  key: ServiceAccountKey;
  issuer: string;
  projectId: string;
  ttlSeconds?: number;
}): Promise<{ accessToken: string; userId: string }> {
  const ttl = options.ttlSeconds ?? 600;
  const cacheKey = `${options.key.keyId}:${options.projectId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { accessToken: cached.accessToken, userId: cached.userId };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: options.key.keyId })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: options.key.userId,
      sub: options.key.userId,
      aud: options.issuer,
      iat: now,
      exp: now + ttl,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const assertion = `${header}.${payload}.${signer.sign(options.key.key, "base64url")}`;

  const response = await fetch(`${options.issuer}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
      scope: `openid profile urn:zitadel:iam:org:project:id:${options.projectId}:aud`,
    }),
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(
      `service-account token exchange failed: ${response.status} ${body.error_description ?? "no access_token"}`,
    );
  }

  cache.set(cacheKey, {
    accessToken: body.access_token,
    userId: options.key.userId,
    expiresAt: (now + ttl) * 1000,
  });
  return { accessToken: body.access_token, userId: options.key.userId };
}
