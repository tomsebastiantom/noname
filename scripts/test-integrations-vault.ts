import "dotenv/config";
import { randomBytes } from "node:crypto";
import { loginWithCredentials } from "../packages/server/src/domains/auth/adapters/zitadel/client";

const ORG = process.env.ZITADEL_DEMO_ORG_ID!;
const BASE = "http://localhost:3000";
const CLIENT_ID = process.env.ZITADEL_CLIENT_ID!;

async function main() {
  const headers = { "x-org-id": ORG };

  const get1 = await fetch(`${BASE}/api/integrations/yogastore/llm`, { headers });
  const before = await get1.json();
  console.log("GET before:", get1.status, before);

  const login = await loginWithCredentials({
    orgId: ORG,
    email: process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost",
    password: process.env.ZITADEL_DEMO_ADMIN_PASSWORD?.trim() ?? "NonameAdmin1!",
    clientId: CLIENT_ID,
    redirectUri: process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback",
    codeVerifier: randomBytes(32).toString("base64url"),
  });
  if (login.status !== "success") {
    throw new Error(`Login failed: ${login.status}`);
  }

  const put = await fetch(`${BASE}/api/integrations/yogastore/llm`, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${login.accessToken}`,
    },
    body: JSON.stringify({
      provider: "openai",
      apiKey: "sk-test-org-byok-key",
      allowPlatformFallback: true,
    }),
  });
  const putBody = await put.json();
  console.log("PUT:", put.status, putBody);

  const get2 = await fetch(`${BASE}/api/integrations/yogastore/llm`, { headers });
  const after = await get2.json();
  console.log("GET after:", get2.status, after);

  const vault = await fetch(
    `${process.env.VAULT_ADDR}/v1/secret/data/noname/orgs/${ORG}/llm/openai`,
    { headers: { "X-Vault-Token": process.env.VAULT_TOKEN! } },
  );
  const vaultBody = (await vault.json()) as { data?: { data?: { apiKey?: string } } };
  const keyMatch = vaultBody.data?.data?.apiKey === "sk-test-org-byok-key";
  console.log("Vault key match:", keyMatch);

  if (!keyMatch || put.status !== 200 || !after.data?.hasOrgKey) {
    process.exit(1);
  }
  console.log("E2E integrations + Vault: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
