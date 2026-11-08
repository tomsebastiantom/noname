import { readFileSync } from "node:fs";

export type VaultAuthConfig =
  | { mode: "token"; token: string }
  | { mode: "agent"; tokenFile: string }
  | {
      mode: "approle";
      addr: string;
      credentials: Record<string, { roleId: string; secretId: string }>;
      mount: string;
    }
  | {
      mode: "kubernetes";
      addr: string;
      roles: Record<string, string>;
      defaultRole?: string;
      jwtPath: string;
      mount: string;
    };

type CachedToken = { token: string; expiresAt: number };
const cache = new Map<string, CachedToken>();

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseMap(value: string | undefined, name: string): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch (cause) {
    throw new Error(`${name} must be a JSON object of orgId -> value: ${String(cause)}`);
  }
}

function parseCredentials(
  value: string | undefined,
): Record<string, { roleId: string; secretId: string }> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, { roleId?: string; secretId?: string }>;
    const result: Record<string, { roleId: string; secretId: string }> = {};
    for (const [orgId, entry] of Object.entries(parsed)) {
      if (!entry?.roleId || !entry?.secretId) {
        throw new Error(`entry ${orgId} needs roleId and secretId`);
      }
      result[orgId] = { roleId: entry.roleId, secretId: entry.secretId };
    }
    return result;
  } catch (cause) {
    throw new Error(`VAULT_APPROLE_CREDENTIALS must map orgId -> {roleId, secretId}: ${String(cause)}`);
  }
}

/**
 * Explicit Vault auth selection. There is no fallback chain: the deployment chooses one mode.
 *
 * - `token`: local development only; refuses to run with NODE_ENV=production.
 * - `agent`: Vault Agent/CSI writes a short-lived token file.
 * - `approle`: one role, one secret id per tenant (per-tenant policy).
 * - `kubernetes`: one or more roles bound to the workload's service account.
 */
export function vaultAuthFromEnv(env: NodeJS.ProcessEnv = process.env): VaultAuthConfig {
  const mode = env.VAULT_AUTH_MODE?.trim();
  if (!mode) {
    throw new Error("VAULT_AUTH_MODE is required (token | agent | approle | kubernetes)");
  }

  if (mode === "token") {
    if (env.NODE_ENV === "production") {
      throw new Error("VAULT_AUTH_MODE=token is local development only; use agent, approle or kubernetes");
    }
    return { mode: "token", token: required(env, "VAULT_TOKEN") };
  }

  if (mode === "agent") {
    return { mode: "agent", tokenFile: required(env, "VAULT_TOKEN_FILE") };
  }

  if (mode === "approle") {
    return {
      mode: "approle",
      addr: required(env, "VAULT_ADDR"),
      credentials: parseCredentials(env.VAULT_APPROLE_CREDENTIALS),
      mount: env.VAULT_APPROLE_MOUNT?.trim() || "approle",
    };
  }

  if (mode === "kubernetes") {
    return {
      mode: "kubernetes",
      addr: required(env, "VAULT_ADDR"),
      roles: parseMap(env.VAULT_KUBERNETES_ROLES, "VAULT_KUBERNETES_ROLES"),
      defaultRole: env.VAULT_KUBERNETES_ROLE?.trim() || undefined,
      jwtPath:
        env.VAULT_KUBERNETES_JWT_PATH?.trim() ||
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
      mount: env.VAULT_KUBERNETES_MOUNT?.trim() || "kubernetes",
    };
  }

  throw new Error(`unknown VAULT_AUTH_MODE "${mode}" (token | agent | approle | kubernetes)`);
}

async function login(
  addr: string,
  mount: string,
  path: string,
  body: Record<string, string>,
): Promise<CachedToken> {
  const response = await fetch(`${addr.replace(/\/$/, "")}/v1/auth/${mount}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Vault login failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    auth?: { client_token?: string; lease_duration?: number };
  };
  const token = payload.auth?.client_token;
  if (!token) throw new Error("Vault login returned no client token");
  const lease = payload.auth?.lease_duration ?? 3600;
  return { token, expiresAt: Date.now() + Math.max(30, lease - 60) * 1000 };
}

/** Resolve a Vault token for one tenant. The token's policy is what scopes the tenant. */
export async function getVaultToken(
  orgId: string,
  config: VaultAuthConfig = vaultAuthFromEnv(),
): Promise<string> {
  const cacheKey = `${config.mode}:${orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  if (config.mode === "token") return config.token;

  if (config.mode === "agent") {
    return readFileSync(config.tokenFile, "utf8").trim();
  }

  if (config.mode === "approle") {
    const entry = config.credentials[orgId];
    if (!entry) throw new Error(`no Vault AppRole credentials configured for org ${orgId}`);
    const result = await login(config.addr, config.mount, "approle", {
      role_id: entry.roleId,
      secret_id: entry.secretId,
    });
    cache.set(cacheKey, result);
    return result.token;
  }

  const role = config.roles[orgId] ?? config.defaultRole;
  if (!role) throw new Error(`no Vault Kubernetes role configured for org ${orgId}`);
  const jwt = readFileSync(config.jwtPath, "utf8").trim();
  const result = await login(config.addr, config.mount, "kubernetes", {
    role,
    jwt,
  });
  cache.set(cacheKey, result);
  return result.token;
}

/** Only for tests: clear the in-process token cache. */
export function clearVaultTokenCache(): void {
  cache.clear();
}
