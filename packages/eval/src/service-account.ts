import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ServiceAccountKey = {
  type?: string;
  keyId: string;
  userId: string;
  key: string;
};

export type ServiceAccountTokenOptions = {
  keyPath: string;
  issuer: string;
  projectId: string;
  /** Token lifetime in seconds; ZITADEL caps it by the project/app setting. */
  ttlSeconds?: number;
};

const cache = new Map<string, { accessToken: string; userId: string; expiresAt: number }>();

/** `zitadel_keys/tenants/<org>/eval-runner-sa.json` unless a different directory is configured. */
export function tenantEvalKeyPath(orgId: string, directory?: string): string {
  return join(directory ?? process.env.EVAL_TENANT_KEYS_DIR ?? "zitadel_keys/tenants", orgId, "eval-runner-sa.json");
}

export function loadServiceAccountKey(keyPath: string): ServiceAccountKey {
  return JSON.parse(readFileSync(keyPath, "utf8")) as ServiceAccountKey;
}

/**
 * Exchange a ZITADEL service-account key for a short-lived access token (RFC 7523 private-key JWT).
 * No shared secret and no `nsv.` token.
 */
export async function createServiceAccountToken(
  options: ServiceAccountTokenOptions,
): Promise<{ accessToken: string; userId: string }> {
  const ttl = options.ttlSeconds ?? 600;
  const cacheKey = `${options.keyPath}:${options.projectId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { accessToken: cached.accessToken, userId: cached.userId };
  }

  const key = loadServiceAccountKey(options.keyPath);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: key.keyId })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: key.userId,
      sub: key.userId,
      aud: options.issuer,
      iat: now,
      exp: now + ttl,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const assertion = `${header}.${payload}.${signer.sign(key.key, "base64url")}`;

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
    userId: key.userId,
    expiresAt: (now + ttl) * 1000,
  });
  return { accessToken: body.access_token, userId: key.userId };
}
