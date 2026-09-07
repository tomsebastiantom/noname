/**
 * Stores a provider API key in Nango as a connection — the key travels
 * process memory → Nango vault, never files, logs, or our database.
 *
 * Usage (PowerShell):
 *   $env:CREDENTIAL_API_KEY = "rk_test_..."
 *   pnpm init:nango:connect
 *
 * Optional: $env:PROVIDER (default "stripe"), $env:CONNECTION_ID
 * (default "<slug>-<provider>-test", needs STORE_SLUG or defaults yogastore).
 * Requires: Nango provisioned (`pnpm init:nango`).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NANGO_HOST = process.env.NANGO_HOST ?? "http://localhost:3003";
const PROVIDER = process.env.PROVIDER ?? "stripe";
const STORE_SLUG = process.env.STORE_SLUG ?? "yogastore";
const CONNECTION_ID = process.env.CONNECTION_ID ?? `${STORE_SLUG}-${PROVIDER}-test`;
const API_KEY = process.env.CREDENTIAL_API_KEY?.trim();

function rootEnv(key: string): string | undefined {
  try {
    const match = readFileSync(join(ROOT, ".env"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  if (!API_KEY) {
    throw new Error("Set CREDENTIAL_API_KEY env var ($env:CREDENTIAL_API_KEY = \"rk_test_...\")");
  }
  const secret = process.env.NANGO_SECRET_KEY?.trim() ?? rootEnv("NANGO_SECRET_KEY")?.trim();
  if (!secret) {
    throw new Error("NANGO_SECRET_KEY missing — run pnpm init:nango first");
  }

  const res = await fetch(`${NANGO_HOST}/connections`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider_config_key: PROVIDER,
      connection_id: CONNECTION_ID,
      credentials: { type: "BASIC", username: API_KEY, password: "" },
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: number; error?: unknown } | null;
  if (!res.ok) {
    throw new Error(`Connection create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  console.log(`Connected ${PROVIDER} as ${CONNECTION_ID} (connection id ${body?.id}).`);
  console.log("Key lives in Nango vault only — nothing stored locally.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
