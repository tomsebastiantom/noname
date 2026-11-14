#!/usr/bin/env node
/**
 * Rancher Desktop local stack helper.
 *
 * Ports are NOT owned by this script. Rancher Desktop's **Port Forwarding** page owns them
 * (`noname` services, fixed local ports) and re-creates them on every start. That is deliberate: a
 * `kubectl port-forward` started from a shell dies with that shell, which made the stack look broken
 * at random. One mechanism, owned by the app that owns the cluster.
 *
 *   node scripts/rancher.mjs up       apply infra overlay, scale app deployments to 0, run migrations
 *   node scripts/rancher.mjs status   cluster + reachability, read-only
 *   node scripts/rancher.mjs env      rewrite .env to the fixed local ports
 *
 * The expected Port Forwarding rows (Rancher Desktop → Port Forwarding):
 *
 *   noname/postgres    postgres -> 25432      noname/keto      read  -> 14466
 *   noname/dragonfly   redis    -> 16379      noname/keto      write -> 14467
 *   noname/clickhouse  http     -> 18123      noname/s3        http  -> 19000
 *   noname/vault       http     -> 18200      noname/zitadel   http  -> 8080
 *
 * Browser UIs do not need a row: they go through Traefik on host port 80
 * (deploy/overlays/local/ingress.yaml) at http://jaeger.localhost and http://nango.localhost.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NS = "noname";
const ENV = join(ROOT, ".env");

const SERVICES = [
  { local: 30432, env: "DATABASE_URL", url: "postgres://noname:noname_dev@127.0.0.1:30432/app" },
  { local: 30379, env: "REDIS_URL", url: "redis://127.0.0.1:30379" },
  { local: 30123, env: "CLICKHOUSE_URL", url: "http://127.0.0.1:30123" },
  { local: 30200, env: "VAULT_ADDR", url: "http://127.0.0.1:30200" },
  { local: 30466, env: "KETO_READ_URL", url: "http://127.0.0.1:30466" },
  { local: 30467, env: "KETO_WRITE_URL", url: "http://127.0.0.1:30467" },
  { local: 30900, env: null, url: "http://127.0.0.1:30900" },
  { local: 8080, env: "ZITADEL_ISSUER", url: "http://localhost:8080" },
];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function upsertEnv(key, value) {
  const content = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(content)
    ? content.replace(pattern, `${key}=${value}`)
    : `${content.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(ENV, next);
}

function listening(port) {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `(Test-NetConnection 127.0.0.1 -Port ${port} -WarningAction SilentlyContinue -InformationLevel Quiet) -eq $true`,
    ],
    { encoding: "utf8" },
  );
  return result.stdout?.trim() === "True";
}

function status() {
  console.log(run("kubectl", ["get", "nodes"]));
  console.log(run("kubectl", ["-n", NS, "get", "deploy"]));
  let missing = 0;
  for (const service of SERVICES) {
    const up = listening(service.local);
    if (!up) missing += 1;
    console.log(`${service.local}\t${service.env ?? "s3 (packages/server/.env)"}\t${up ? "reachable" : "DOWN"}`);
  }
  if (missing > 0) {
    console.log(
      `\n${missing} port(s) down — add them in Rancher Desktop → Port Forwarding (see the header of this file).`,
    );
    process.exitCode = 1;
  }
}

function up() {
  run("kubectl", ["get", "nodes"]);
  run("kubectl", ["apply", "-k", "deploy/overlays/local"]);
  run("kubectl", ["-n", NS, "scale", "deploy", "api", "worker", "client", "browser", "--replicas=0"]);
  run("kubectl", ["-n", NS, "delete", "job", "migrate", "--ignore-not-found"]);
  if (!listening(25432)) {
    throw new Error(
      "postgres is not reachable on 127.0.0.1:25432 — add the Port Forwarding rows in Rancher Desktop first",
    );
  }
  run("pnpm", ["--filter", "@noname/server", "db:migrate"], {
    env: { ...process.env, DATABASE_URL: "postgres://noname:noname_dev@127.0.0.1:25432/app" },
  });
  status();
}

const command = process.argv[2] ?? "status";
try {
  if (command === "up") up();
  else if (command === "status") status();
  else if (command === "env") {
    for (const service of SERVICES) if (service.env) upsertEnv(service.env, service.url);
    console.log("env rewritten to the fixed local ports");
  } else {
    console.error(`unknown command ${command} (up | status | env)`);
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
