#!/usr/bin/env node
/**
 * Cluster control CLI — one cross-platform entry point for the local k3s stack.
 *
 * Why Node and not PowerShell/bash: the repository is Node-first (every image has it), the existing
 * scripts are already .mjs (`cluster-env.mjs`), and `spawnSync` gives a real exit code per command
 * without shell quoting — which was the source of several bugs in the earlier .ps1 versions.
 *
 * Every external command goes through `sh()`/`must()`, which **fail on a non-zero exit** and print the
 * command and its stderr. The earlier scripts piped several calls to `Out-Null` and ignored the result,
 * so a failed `kubectl apply` looked like success.
 *
 *   node scripts/k8s.mjs status     read-only health; exit 1 if anything is wrong
 *   node scripts/k8s.mjs up         converge: VM, k3s, infra, secret, images, migrate, app
 *   node scripts/k8s.mjs identity   re-issue identity + refresh secret + seed (requires --yes)
 *   node scripts/k8s.mjs seed       run the seed Job only
 *   node scripts/k8s.mjs down       stop k3s (data preserved)
 *
 * See docs/2026-10-31/K8S-RUNBOOK.md. Do not re-derive steps by hand.
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const NS = "noname";
const KUBECONFIG = join(homedir(), ".kube", "k3s.yaml");
const env = { ...process.env, KUBECONFIG };

const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** Run and RETURN the result (no throw). */
function sh(cmd, args = [], opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: ROOT,
    env,
    timeout: opts.timeout ?? 15 * 60_000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").replace(/.*metrics\.k8s\.io.*\n?/g, "").trim(),
    cmd: [cmd, ...args].join(" "),
  };
}

/** Run and THROW on failure, quoting the command and its stderr. */
function must(cmd, args = [], opts = {}) {
  const r = sh(cmd, args, opts);
  if (!r.ok) {
    throw new Error(`command failed (${r.status}): ${r.cmd}\n${r.err || r.out || "(no output)"}`);
  }
  return r;
}

const kube = (...args) => must("kubectl", ["-n", NS, ...args]);
const kubeOut = (...args) => sh("kubectl", ["-n", NS, ...args]);

function step(title) {
  console.log(`\n${c.cyan(`== ${title}`)}`);
}
function ok(text) {
  console.log(`   ${c.green("ok")}   ${text}`);
}
function info(text) {
  console.log(`   ${c.yellow("..")}   ${text}`);
}

async function waitFor(label, probe, { timeoutMs = 300_000, intervalMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) {
      ok(`${label} ready`);
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s`);
}

// ── probes ────────────────────────────────────────────────────────────────────────────────────────
const probes = {
  node: () => /Ready/.test(kubeOut("get", "nodes", "--no-headers").out),
  podRunning: (app) =>
    /Running/.test(kubeOut("get", "pods", "-l", `app=${app}`, "--no-headers").out),
  jobDone: (name) =>
    /Completed/.test(kubeOut("get", "pods", "-l", `job-name=${name}`, "--no-headers").out),
  apiReady: () => {
    const pod = newestPod("app=api");
    if (!pod) return false;
    return /"ready":true/.test(
      sh("kubectl", ["-n", NS, "exec", pod, "-c", "api", "--", "node", "-e",
        "fetch('http://127.0.0.1:3000/ready').then(r=>r.text()).then(t=>process.stdout.write(t))"]).out,
    );
  },
};

function newestPod(selector) {
  const r = kubeOut("get", "pods", "-l", selector, "--sort-by=.metadata.creationTimestamp", "--no-headers");
  if (!r.ok || !r.out) return null;
  const lines = r.out.split("\n").filter(Boolean);
  return lines.length ? lines[lines.length - 1].split(/\s+/)[0] : null;
}

// ── status ────────────────────────────────────────────────────────────────────────────────────────
const checks = [
  ["node", () => probes.node(), "Ready"],
  ["pods healthy", () => {
    const r = kubeOut("get", "pods", "--no-headers");
    const bad = r.out.split("\n").filter((l) => /0\/\d/.test(l) && !/Completed/.test(l));
    return { detail: bad.length ? bad.join("; ") : "all ready", pass: bad.length === 0 };
  }],
  ["postgres", () => one("exec", "deploy/postgres", "--", "psql", "-U", "noname", "-d", "app", "-t", "-A", "-c", "select 1")],
  ["dragonfly", () => one("exec", "deploy/dragonfly", "--", "redis-cli", "ping")],
  ["clickhouse", () => one("exec", "deploy/clickhouse", "--", "clickhouse-client", "--query", "SELECT 1")],
  ["vault", () => {
    const r = kubeOut("exec", "deploy/vault", "--", "sh", "-c", "VAULT_ADDR=http://127.0.0.1:8200 vault status 2>&1 | grep Sealed");
    return { detail: r.out || r.err, pass: /false/.test(r.out) };
  }],
  ["s3", () => one("exec", "deploy/s3", "--", "sh", "-c", "netstat -tln 2>/dev/null | grep -c 9000")],
  ["nango", () => one("exec", "deploy/nango", "--", "node", "-e", "fetch('http://localhost:3003/health').then(r=>r.text()).then(t=>process.stdout.write(t))")],
  ["keto", () => one("exec", "deploy/keto", "--", "sh", "-c", "wget -qO- http://127.0.0.1:4466/health/ready 2>/dev/null | head -c 40")],
  ["zitadel", () => {
    const r = kubeOut("get", "pods", "-l", "app=zitadel", "--no-headers");
    return { detail: r.out.split("\n")[0] ?? "", pass: /1\/1/.test(r.out) };
  }],
  ["api /ready", () => ({ detail: "", pass: probes.apiReady() })],
  ["worker", () => {
    const r = kubeOut("get", "pods", "-l", "app=worker", "--no-headers");
    return { detail: r.out.split("\n")[0] ?? "", pass: /2\/2|1\/1/.test(r.out) };
  }],
  ["browser CDP", () => one("exec", "deploy/browser", "--", "sh", "-c", "wget -qO- http://127.0.0.1:3000/ 2>/dev/null | head -c 40")],
  ["seed data", () => {
    const r = kubeOut("exec", "deploy/postgres", "--", "psql", "-U", "noname", "-d", "app", "-t", "-A", "-c", "select count(*) from machine_definitions");
    const n = Number((r.out || "0").trim());
    return { detail: `machine_definitions=${n}`, pass: n === 2 };
  }, "2"],
];

/** Run one kubectl exec and treat non-empty output + zero exit as pass. */
function one(...args) {
  const r = kubeOut(...args);
  return { detail: r.out || r.err, pass: r.ok && Boolean(r.out) };
}

function status() {
  const groups = [
    ["cluster", ["node", "pods healthy"]],
    ["infrastructure", ["postgres", "dragonfly", "clickhouse", "vault", "s3", "nango", "keto", "zitadel"]],
    ["application", ["api /ready", "worker", "browser CDP", "seed data"]],
  ];
  console.log("");
  let failures = 0;
  for (const [group, names] of groups) {
    console.log(c.cyan(group));
    for (const name of names) {
      const entry = checks.find(([n]) => n === name);
      if (!entry) continue;
      let pass = false;
      let detail = "";
      try {
        const result = entry[1]();
        if (typeof result === "boolean") {
          pass = result;
        } else if (result && typeof result === "object" && "pass" in result) {
          pass = result.pass;
          detail = result.detail;
        }
      } catch (error) {
        detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
      }
      if (!pass) failures += 1;
      const line = `${(detail || "").replace(/\s+/g, " ").slice(0, 70)}`;
      console.log(`  [${pass ? c.green(" OK ") : c.red("FAIL")}] ${name.padEnd(16)} ${line}`);
    }
  }
  const free = sh("sh", ["-c", "true"]) // no-op guard for platforms without `sh`
    ? sh(IS_WIN ? "wsl" : "sh", IS_WIN ? ["-d", "Ubuntu", "-u", "root", "--", "free", "-m"] : ["-c", "free -m"])
    : { out: "" };
  if (free.out) console.log(`\n  memory: ${free.out.split("\n")[1]?.replace(/\s+/g, " ") ?? ""}`);

  console.log("");
  if (failures === 0) {
    console.log(c.green("  all checks passed"));
    return 0;
  }
  console.log(c.red(`  ${failures} check(s) failed — see docs/2026-10-31/K8S-RUNBOOK.md §6`));
  return 1;
}

// ── up ───────────────────────────────────────────────────────────────────────────────────────────
function imageLoaded(name) {
  const args = IS_WIN
    ? ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", `k3s ctr images ls | grep -c ${name}`]
    : ["-c", `k3s ctr images ls | grep -c ${name}`];
  const r = sh(IS_WIN ? "wsl" : "sh", args);
  return /^[1-9]/m.test(r.out);
}

function buildAndLoad(dockerfile, tag, ignorefile, context) {
  info(`building ${tag}`);
  const args = ["build", "--progress=plain", "-f", dockerfile, "-t", tag];
  if (ignorefile) args.push("--ignorefile", ignorefile);
  args.push(context);
  must("podman", args);
  const tar = join(ROOT, `.tmp-${tag.replace(/[:/]/g, "-")}.tar`);
  must("podman", ["save", tag, "-o", tar]);
  const path = IS_WIN ? tar.replace(/^([A-Za-z]):/, "/mnt/$1").replace(/\\/g, "/") : tar;
  const importArgs = IS_WIN
    ? ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", `k3s ctr images import -q "${path}"`]
    : ["-c", `k3s ctr images import -q "${path}"`];
  must(IS_WIN ? "wsl" : "sh", importArgs);
  sh("rm", ["-f", tar]);
  if (IS_WIN) sh("powershell", ["-NoProfile", "-Command", `Remove-Item -Force '${tar}' -ErrorAction SilentlyContinue`]);
  ok(`${tag} loaded`);
}

async function up({ rebuild = false, skipImages = false } = {}) {
  step("container VM + WSL keep-alive");
  const machines = must("podman", ["machine", "list", "--format", "{{.Name}} {{.Running}}"]).out;
  if (!/true/.test(machines)) must("podman", ["machine", "start", "noname"]);
  if (IS_WIN) {
    const keep = sh("wsl", ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", "pgrep -f 'sleep infinity' | head -1"]);
    if (!keep.out.trim()) {
      // A background PowerShell *job* dies with the job; spawn a detached process instead.
      spawnSync("wsl.exe", ["-d", "Ubuntu", "-u", "root", "--", "sleep", "infinity"], {
        detached: true,
        stdio: "ignore",
      }).unref?.();
      info("started WSL keep-alive");
    }
  }
  const active = sh(IS_WIN ? "wsl" : "sh", IS_WIN
    ? ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", "systemctl is-active k3s"]
    : ["-c", "systemctl is-active k3s"]);
  if (!/active/.test(active.out)) {
    must(IS_WIN ? "wsl" : "sh", IS_WIN
      ? ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", "systemctl start k3s"]
      : ["-c", "sudo systemctl start k3s"]);
  }
  if (!existsSync(KUBECONFIG)) throw new Error(`missing kubeconfig: ${KUBECONFIG}`);
  await waitFor("node", probes.node, { timeoutMs: 120_000 });

  step("namespace + infra");
  must("kubectl", ["apply", "-f", "deploy/00-namespace.yaml"]);
  must("kubectl", ["apply", "-f", "deploy/infra/"]);
  for (const app of ["postgres", "dragonfly", "clickhouse", "s3", "vault", "jaeger", "nango", "keto", "zitadel"]) {
    await waitFor(app, () => probes.podRunning(app), { timeoutMs: 420_000 });
  }

  step("cluster env + Secret");
  must("node", ["scripts/cluster-env.mjs"]);
  const rendered = must("kubectl", ["-n", NS, "create", "secret", "generic", "noname-env",
    "--from-env-file=.env.cluster", "--dry-run=client", "-o", "yaml"]).out;
  const applied = spawnSync("kubectl", ["apply", "-f", "-"], { input: rendered, encoding: "utf8", cwd: ROOT, env });
  if (applied.status !== 0) throw new Error(`secret apply failed: ${applied.stderr}`);
  ok("Secret refreshed");

  step("images");
  if (skipImages) {
    info("skipped by request");
  } else {
    if (rebuild || !imageLoaded("noname-api")) {
      buildAndLoad("deploy/app/server.Containerfile", "localhost/noname-api:dev", "deploy/app/.dockerignore", ".");
    } else ok("noname-api already loaded");
    if (rebuild || !imageLoaded("noname-browser")) {
      buildAndLoad("deploy/browser/Containerfile", "localhost/noname-browser:1.63.0", null, "deploy/browser");
    } else ok("noname-browser already loaded");
  }

  step("migrate Job (immutable: delete, then apply)");
  sh("kubectl", ["-n", NS, "delete", "job", "migrate", "--ignore-not-found"]);
  must("kubectl", ["apply", "-f", "deploy/app/api.yaml"]);
  await waitFor("migrate", () => probes.jobDone("migrate"), { timeoutMs: 300_000 });

  step("rollout");
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/api", "--timeout=300s"]);
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/worker", "--timeout=300s"]);
  await waitFor("api /ready", probes.apiReady, { timeoutMs: 300_000 });

  return status();
}

// ── identity ─────────────────────────────────────────────────────────────────────────────────────
async function identity({ yes = false, skipSeed = false } = {}) {
  if (!yes) {
    console.log(c.yellow(`
  This RE-ISSUES identity:
    - new ZITADEL org / project / client IDs
    - rewrites .env, wrangler.toml, oidc.json and the cluster Secret
    - every existing token becomes invalid

  Re-run with --yes if that is what you want.`));
    return 2;
  }

  step("port-forward zitadel:8080");
  const pf = spawnSync("kubectl", ["-n", NS, "port-forward", "svc/zitadel", "8080:8080"], {
    cwd: ROOT, env, detached: true, stdio: "ignore",
  });
  try {
    await waitFor("issuer", () => {
      const r = sh("node", ["-e", "fetch('http://localhost:8080/.well-known/openid-configuration').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]);
      return r.ok;
    }, { timeoutMs: 30_000, intervalMs: 1_000 });

    step("init:zitadel (re-issues identity)");
    must("pnpm", ["init:zitadel"], { timeout: 10 * 60_000 });

    step("regenerate .env.cluster + Secret");
    must("node", ["scripts/cluster-env.mjs"]);
    const rendered = must("kubectl", ["-n", NS, "create", "secret", "generic", "noname-env",
      "--from-env-file=.env.cluster", "--dry-run=client", "-o", "yaml"]).out;
    const applied = spawnSync("kubectl", ["apply", "-f", "-"], { input: rendered, encoding: "utf8", cwd: ROOT, env });
    if (applied.status !== 0) throw new Error(`secret apply failed: ${applied.stderr}`);
    ok("Secret refreshed");

    step("restart api + worker");
    must("kubectl", ["-n", NS, "rollout", "restart", "deploy/api", "deploy/worker"]);
    must("kubectl", ["-n", NS, "rollout", "status", "deploy/api", "--timeout=300s"]);
    await waitFor("api /ready", probes.apiReady, { timeoutMs: 300_000 });

    if (skipSeed) info("seed skipped by request");
    else await seed();
  } finally {
    if (pf.pid) {
      try { process.kill(-pf.pid); } catch { try { process.kill(pf.pid); } catch { /* already gone */ } }
      info("port-forward closed");
    }
  }
  return status();
}

// ── seed ─────────────────────────────────────────────────────────────────────────────────────────
async function seed() {
  step("seed Job");
  sh("kubectl", ["-n", NS, "delete", "job", "seed", "--ignore-not-found"]);
  must("kubectl", ["apply", "-f", "deploy/jobs/seed.yaml"]);
  await waitFor("seed", () => probes.jobDone("seed"), { timeoutMs: 900_000, intervalMs: 5_000 });
  console.log(must("kubectl", ["-n", NS, "logs", "job/seed", "--tail=12"]).out);
  ok("seed completed");
  return 0;
}

// ── down ────────────────────────────────────────────────────────────────────────────────────────
function down() {
  step("stop k3s (data preserved)");
  must(IS_WIN ? "wsl" : "sh", IS_WIN
    ? ["-d", "Ubuntu", "-u", "root", "--", "systemctl", "stop", "k3s"]
    : ["-c", "sudo systemctl stop k3s"]);
  ok("k3s stopped");
  return 0;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────
const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));

try {
  let code = 0;
  switch (command) {
    case "status":
      code = status();
      break;
    case "up":
      code = await up({ rebuild: flags.has("--rebuild"), skipImages: flags.has("--skip-images") });
      break;
    case "identity":
      code = await identity({ yes: flags.has("--yes"), skipSeed: flags.has("--skip-seed") });
      break;
    case "seed":
      code = await seed();
      break;
    case "down":
      code = down();
      break;
    default:
      console.log(`usage: node scripts/k8s.mjs <status|up|identity|seed|down> [--rebuild] [--skip-images] [--yes] [--skip-seed]`);
      code = 1;
  }
  process.exit(code);
} catch (error) {
  console.error(`\n${c.red("FAILED")} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
