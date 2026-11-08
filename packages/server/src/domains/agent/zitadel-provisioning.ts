import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ServiceUnavailableError } from "../../shared/domain-error";
import { serviceAccountToken, type ServiceAccountKey } from "../../shared/zitadel-token";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const BACKEND_KEY =
  process.env.ZITADEL_MACHINE_KEY_PATH?.trim() ??
  join(ROOT, "zitadel_keys/noname-backend-sa.json");
const AGENT_KEY_DIR = join(ROOT, "zitadel_keys/agents");

type AgentRow = { id: string; slug: string; zitadelAgentUserId: string | null };

async function managementToken(): Promise<string> {
  const key = JSON.parse(readFileSync(BACKEND_KEY, "utf8")) as ServiceAccountKey;
  const token = await serviceAccountToken({
    issuer: process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080",
    key,
    scopes: "openid urn:zitadel:iam:org:project:id:zitadel:aud",
  });
  return token.accessToken;
}

async function post(token: string, path: string, body: unknown): Promise<unknown> {
  const issuer = process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080";
  const response = await fetch(`${issuer}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ServiceUnavailableError(
      `ZITADEL agent provisioning failed at ${path}: HTTP ${response.status}`,
    );
  }
  return response.json();
}

/**
 * One ZITADEL machine user per agent, provisioned lazily on first token request.
 *
 * The agent's private key is written under `zitadel_keys/agents/<agentId>.json` (gitignored); only the machine
 * user id is stored in the database. The machine user receives the narrow `IAM_ADMIN_IMPERSONATOR` role, which
 * is what token exchange requires for delegation.
 */
export async function ensureAgentActor(
  orgId: string,
  agent: AgentRow,
  setZitadelAgentUserId: (orgId: string, id: string, zitadelUserId: string) => Promise<void>,
): Promise<ServiceAccountKey> {
  const keyPath = join(AGENT_KEY_DIR, `${agent.id}.json`);
  if (agent.zitadelAgentUserId && existsSync(keyPath)) {
    return JSON.parse(readFileSync(keyPath, "utf8")) as ServiceAccountKey;
  }

  const token = await managementToken();
  const created = (await post(token, "/management/v1/users/machine", {
    userName: `agent-${agent.slug}-${agent.id.slice(0, 8)}`,
    name: agent.slug,
    description: `Agent identity for ${agent.slug}`,
    accessTokenType: "ACCESS_TOKEN_TYPE_JWT",
  })) as { userId?: string };
  const userId = created.userId;
  if (!userId) throw new ServiceUnavailableError("ZITADEL agent provisioning returned no userId");

  const keyResponse = (await post(token, `/management/v1/users/${userId}/keys`, {
    type: "KEY_TYPE_JSON",
    expirationDate: "2029-01-01T00:00:00Z",
  })) as { keyDetails?: string };
  if (!keyResponse.keyDetails) {
    throw new ServiceUnavailableError("ZITADEL agent provisioning returned no key");
  }
  const details = JSON.parse(
    Buffer.from(keyResponse.keyDetails, "base64").toString("utf8"),
  ) as { keyId: string; key: string; userId: string };

  mkdirSync(AGENT_KEY_DIR, { recursive: true });
  const actorKey: ServiceAccountKey = {
    type: "serviceaccount",
    keyId: details.keyId,
    key: details.key,
    userId: details.userId,
  };
  writeFileSync(keyPath, JSON.stringify(actorKey, null, 2));

  const issuer = process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080";
  const member = await fetch(`${issuer}/admin/v1/members`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ userId, roles: ["IAM_ADMIN_IMPERSONATOR"] }),
  });
  if (!member.ok && member.status !== 409) {
    throw new ServiceUnavailableError(
      `ZITADEL agent impersonation grant failed: HTTP ${member.status}`,
    );
  }

  await setZitadelAgentUserId(orgId, agent.id, userId).catch(() => undefined);
  return actorKey;
}

/**
 * Remove the agent's ZITADEL machine user and private key. Called before the registry row is deleted so a
 * failed deprovision aborts the delete instead of leaving an orphaned credential that can still exchange.
 */
export async function deprovisionAgentActor(agent: {
  id: string;
  zitadelAgentUserId: string | null;
}): Promise<void> {
  const keyPath = join(AGENT_KEY_DIR, `${agent.id}.json`);

  if (agent.zitadelAgentUserId) {
    const token = await managementToken();
    const issuer = process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080";
    const response = await fetch(
      `${issuer}/management/v1/users/${agent.zitadelAgentUserId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableError(
        `ZITADEL agent deprovisioning failed: HTTP ${response.status}`,
      );
    }
  }

  if (existsSync(keyPath)) unlinkSync(keyPath);
}
