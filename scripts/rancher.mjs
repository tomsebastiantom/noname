#!/usr/bin/env node
/**
 * Rancher Desktop local stack: infra in the cluster, app on the host.
 *
 * Rancher Desktop on Windows does not expose Kubernetes NodePorts on localhost reliably, so this script owns
 * a small set of `kubectl port-forward` processes and rewrites `.env` to those local ports. That is the only
 * host↔cluster bridge; the app still talks to the cluster, not to a second compose stack.
 *
 *   node scripts/rancher.mjs up       apply infra, start forwards, migrate
 *   node scripts/rancher.mjs status   read-only
 *   node scripts/rancher.mjs down     stop forwards
 *   node scripts/rancher.mjs forward  only (re)start forwards
 *   node scripts/rancher.mjs env      only rewrite .env
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NS = "noname";
const STATE = join(ROOT, ".rancher-port-forwards.json");
const ENV = join(ROOT, ".env");

const SERVICES = [
  { name: "postgres", local: 25432, remote: 5432, env: "DATABASE_URL", url: "postgres://noname:noname_dev@127.0.0.1:25432/app" },
  { name: "dragonfly", local: 16379, remote: 6379, env: "REDIS_URL", url: "redis://127.0.0.1:16379" },
  { name: "clickhouse", local: 18123, remote: 8123, env: "CLICKHOUSE_URL", url: "http://127.0.0.1:18123" },
  { name: "vault", local: 18200, remote: 8200, env: "VAULT_ADDR", url: "http://127.0.0.1:18200" },
  { name: "keto", local: 14466, remote: 4466, env: "KETO_READ_URL", url: "http://127.0.0.1:14466" },
  { name: "keto", local: 14467, remote: 4467, env: "KETO_WRITE_URL", url: "http://127.0.0.1:14467" },
  { name: "zitadel", local: 8080, remote: 8080, env: "ZITADEL_ISSUER", url: "http://127.0.0.1:8080" },
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

function killForwards() {
  if (!existsSync(STATE)) return;
  const pids = JSON.parse(readFileSync(STATE, "utf8"));
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // already gone
    }
  }
  writeFileSync(STATE, "[]");
}

function startForwards() {
  killForwards();
  const pids = [];
  for (const service of SERVICES) {
    const child = spawn(
      "kubectl",
      ["-n", NS, "port-forward", "--address", "127.0.0.1", `svc/${service.name}`, `${service.local}:${service.remote}`],
      { cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    pids.push(child.pid);
  }
  writeFileSync(STATE, JSON.stringify(pids));
  for (const service of SERVICES) upsertEnv(service.env, service.url);
  console.log(`port-forwards: ${SERVICES.map((s) => `${s.local}->${s.name}:${s.remote}`).join(", ")}`);
}

function status() {
  console.log(run("kubectl", ["get", "nodes"]));
  console.log(run("kubectl", ["-n", NS, "get", "pods"]));
  for (const service of SERVICES) {
    const ok = spawnSync("powershell", ["-NoProfile", "-Command", `(Test-NetConnection 127.0.0.1 -Port ${service.local} -WarningAction SilentlyContinue -InformationLevel Quiet) -eq $true`]);
    console.log(`${service.env}=${service.url} reachable=${ok.stdout?.toString().trim()}`);
  }
}

function up() {
  run("kubectl", ["get", "nodes"]);
  run("kubectl", ["apply", "-k", "deploy/overlays/local"]);
  run("kubectl", ["-n", NS, "scale", "deploy", "api", "worker", "client", "browser", "--replicas=0"]);
  run("kubectl", ["-n", NS, "delete", "job", "migrate", "--ignore-not-found"]);
  startForwards();
  console.log("waiting for postgres…");
  for (let i = 0; i < 30; i++) {
    const ready = spawnSync("powershell", ["-NoProfile", "-Command", "(Test-NetConnection 127.0.0.1 -Port 25432 -WarningAction SilentlyContinue -InformationLevel Quiet) -eq $true"]);
    if (ready.stdout?.toString().trim() === "True") break;
    spawnSync("powershell", ["-NoProfile", "-Command", "Start-Sleep -Seconds 2"]);
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
  else if (command === "down") {
    killForwards();
    console.log("port-forwards stopped");
  } else if (command === "forward") startForwards();
  else if (command === "env") {
    for (const service of SERVICES) upsertEnv(service.env, service.url);
    console.log("env rewritten");
  } else {
    console.error(`unknown command ${command} (up | status | down | forward | env)`);
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
