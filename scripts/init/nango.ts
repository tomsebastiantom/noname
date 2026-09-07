/**
 * Provisions self-hosted Nango for local dev — no dashboard clicks:
 * admin signup (API) → email verify (DB) → adopt env secret key →
 * Stripe integration (API, idempotent).
 * Requires: podman compose up (Nango healthy) + postgres reachable.
 *
 * Run: pnpm init:nango
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NANGO_HOST = process.env.NANGO_HOST ?? "http://localhost:3003";
const ADMIN_NAME = process.env.NANGO_ADMIN_NAME ?? "Noname Admin";
const ADMIN_EMAIL = process.env.NANGO_ADMIN_EMAIL ?? "admin@noname.localhost";
const ADMIN_PASSWORD = process.env.NANGO_ADMIN_PASSWORD ?? "NonameDev123!x";

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT });
}

function psql(db: string, sql: string): string {
  const safe = sql.replace(/"/g, '\\"');
  return sh(`podman exec noname-postgres-1 psql -U noname -d ${db} -t -c "${safe}"`).trim();
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${NANGO_HOST}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Nango not healthy at " + NANGO_HOST);
}

async function nangoApi(
  path: string,
  secret: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${NANGO_HOST}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = (await res.json()) as unknown;
  } catch {
    // ignore
  }
  return { status: res.status, json };
}

function setEnvVar(file: string, key: string, value: string): void {
  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch {
    // create
  }
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += `${line}\n`;
  }
  writeFileSync(file, content);
}

async function main(): Promise<void> {
  console.log("Waiting for Nango...");
  await waitForHealth();

  console.log("Ensuring admin account (signin probe, then signup)...");
  const credentials = JSON.stringify({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  async function canSignIn(): Promise<boolean> {
    try {
      const res = await fetch(`${NANGO_HOST}/api/v1/account/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: credentials,
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  if (!(await canSignIn())) {
    let signedUp = await canSignIn();
    for (let i = 0; i < 3 && !signedUp; i++) {
      try {
        const res = await fetch(`${NANGO_HOST}/api/v1/account/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
        });
        if (res.status === 429) {
          // Signup is rate-limited — back off hard.
          console.log("Signup rate-limited, waiting 90s...");
          await new Promise((r) => setTimeout(r, 90_000));
          continue;
        }
        signedUp = res.ok || (await canSignIn());
      } catch {
        // Nango still migrating — retry.
      }
      if (!signedUp) await new Promise((r) => setTimeout(r, 15_000));
    }
    if (!signedUp) {
      throw new Error("Nango admin not ready (migrations still running?)");
    }
  } else {
    console.log("Admin already exists.");
  }

  console.log("Verifying email (dev only, direct DB)...");
  psql(
    "nango",
    `UPDATE nango._nango_users SET email_verified = true WHERE email = '${ADMIN_EMAIL}';`,
  );

  console.log("Adopting environment secret key...");
  // Nango resolves environments first-match: adopt the OLDEST dev row.
  // (Repeated boots seed duplicate rows; newest is not live.)
  const secret = psql(
    "nango",
    `SELECT secret_key FROM nango._nango_environments WHERE name = 'dev' ORDER BY id ASC LIMIT 1;`,
  ).trim();
  if (!secret || secret.length < 8) {
    throw new Error("Could not read Nango dev secret key");
  }
  setEnvVar(join(ROOT, ".env"), "NANGO_SECRET_KEY", secret);
  setEnvVar(join(ROOT, "packages/server/.env"), "NANGO_SECRET_KEY", secret);
  setEnvVar(join(ROOT, "packages/server/.env"), "NANGO_HOST", NANGO_HOST);

  console.log("Ensuring Stripe integration...");
  const list = await nangoApi("/integrations", secret);
  const configs = (list.json as { configs?: Array<{ unique_key?: string }> } | null)?.configs ?? [];
  if (!configs.some((c) => c.unique_key === "stripe")) {
    const created = await nangoApi("/integrations", secret, {
      method: "POST",
      body: { unique_key: "stripe", provider: "stripe-api-key", display_name: "Stripe" },
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`Stripe integration create failed: ${created.status}`);
    }
  } else {
    console.log("Stripe integration already exists.");
  }

  console.log("Nango ready: admin + secret key + Stripe integration.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
