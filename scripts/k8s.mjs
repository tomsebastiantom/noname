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
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
  ["client", () => {
    // Serves the built SPA through nginx.
    const r = kubeOut("exec", "deploy/client", "--", "wget", "-qO-", "http://127.0.0.1/index.html");
    return { detail: r.out ? "index.html served" : r.err, pass: /doctype html/i.test(r.out) };
  }],
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
    ["application", ["api /ready", "worker", "client", "browser CDP", "seed data"]],
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
  const free = sh(IS_WIN ? "wsl" : "sh", IS_WIN ? ["-d", "Ubuntu", "-u", "root", "--", "free", "-m"] : ["-c", "free -m"]);
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
  // `/active/.test("inactive")` is TRUE, so the earlier guard never started a stopped k3s and `up` then
  // failed 120 s later waiting for a node that was never coming. Match the exact state word.
  if (!/^active$/m.test(active.out.trim())) {
    must(IS_WIN ? "wsl" : "sh", IS_WIN
      ? ["-d", "Ubuntu", "-u", "root", "--", "sh", "-c", "systemctl start k3s"]
      : ["-c", "sudo systemctl start k3s"]);
  }
  if (!existsSync(KUBECONFIG)) throw new Error(`missing kubeconfig: ${KUBECONFIG}`);
  // A cold k3s start brings the API server up in ~10 s here, but give a slow host room.
  await waitFor("node", probes.node, { timeoutMs: 180_000, intervalMs: 3_000 });

  // One kustomize overlay for the whole shape: base + the local overlay. Applying individual files was how
  // dev values ended up one careless `apply -f deploy/` away from another environment - see
  // docs/2026-10-31/ENVIRONMENTS-AND-PROMOTION.md §5.
  step("namespace + infra (kustomize overlay)");
  must("kubectl", ["apply", "-k", "deploy/overlays/local"]);
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
    const images = [
      ["deploy/app/server.Containerfile", "localhost/noname-api:dev", "deploy/app/.dockerignore", ".", "noname-api"],
      ["deploy/browser/Containerfile", "localhost/noname-browser:1.63.0", null, "deploy/browser", "noname-browser"],
      ["deploy/client/Containerfile", "localhost/noname-client:dev", "deploy/app/.dockerignore", ".", "noname-client"],
    ];
    for (const [dockerfile, tag, ignorefile, context, marker] of images) {
      if (rebuild || !imageLoaded(marker)) buildAndLoad(dockerfile, tag, ignorefile, context);
      else ok(`${marker} already loaded`);
    }
  }

  // Job pod templates are immutable, and *every* credential rotation changes them (the env now comes from
  // secretKeyRef). Deleting only `migrate` meant the next rotation failed on keto-migrate and s3-init with
  // "spec.template: Invalid value ... immutable". All three are safe to recreate: `migrate up` is idempotent
  // and s3-init checks for the bucket before creating it. `identity` and `seed` are NOT in the overlay, so
  // they cannot be recreated by accident here - they are deliberate acts.
  const ONE_SHOT_JOBS = ["migrate", "keto-migrate", "s3-init"];
  step(`one-shot Jobs (immutable: recreate ${ONE_SHOT_JOBS.join(", ")})`);
  for (const job of ONE_SHOT_JOBS) {
    sh("kubectl", ["-n", NS, "delete", "job", job, "--ignore-not-found"]);
  }
  must("kubectl", ["apply", "-k", "deploy/overlays/local"]);
  for (const job of ONE_SHOT_JOBS) {
    await waitFor(job, () => probes.jobDone(job), { timeoutMs: 300_000 });
  }

  step("rollout");
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/api", "--timeout=300s"]);
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/worker", "--timeout=300s"]);
  await waitFor("api /ready", probes.apiReady, { timeoutMs: 300_000 });

  // The client is part of the overlay; it is stated separately here because its nginx proxies /api to the edge,
  // and the edge is NOT in the cluster (docs/2026-10-31/EDGE.md) - it runs on the host via `wrangler dev`.
  step("client");
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/client", "--timeout=300s"]);

  return status();
}

// ── identity ─────────────────────────────────────────────────────────────────────────────────────
/**
 * Provision identity **inside the cluster** and patch the Secret from there.
 *
 * The earlier flow ran on the host: port-forward, `pnpm init:zitadel`, regenerate `.env.cluster`, apply
 * the Secret. That made the developer's `.env` the source of truth for cluster identity, so a fresh clone
 * could not reproduce the cluster. `deploy/base/jobs/identity.yaml` now does all of it in-cluster —
 * `scripts/init/zitadel-oidc.ts` reads the machine key from the `zitadel-keys` PVC, and
 * `scripts/init/patch-secret.mjs` merges the results into `noname-env` through the Kubernetes API and
 * rolls api + worker. No kubectl binary, no host copy, narrow RBAC.
 *
 * Still deliberate (`--yes`): it mints IDs and invalidates existing tokens.
 */
async function identity({ yes = false } = {}) {
  if (!yes) {
    console.log(c.yellow(`
  This RE-ISSUES identity:
    - new ZITADEL org / project / client IDs
    - patches the noname-env Secret and rolls api + worker
    - every existing token becomes invalid

  Re-run with --yes if that is what you want.`));
    return 2;
  }

  step("identity Job (in-cluster)");
  sh("kubectl", ["-n", NS, "delete", "job", "identity", "--ignore-not-found"]);
  must("kubectl", ["apply", "-f", "deploy/base/jobs/identity.yaml"]);
  await waitFor("identity", () => probes.jobDone("identity"), { timeoutMs: 600_000 });
  console.log(must("kubectl", ["-n", NS, "logs", "job/identity", "-c", "identity", "--tail=8"]).out);

  step("wait for the rolled workloads");
  must("kubectl", ["-n", NS, "rollout", "status", "deploy/api", "--timeout=300s"]);
  await waitFor("api /ready", probes.apiReady, { timeoutMs: 300_000 });

  step("sync host files from the Secret");
  await pullHostIdentity();
  return status();
}

/**
 * Copy the identity keys from the cluster Secret into the host files that local tooling reads:
 * root `.env`, `packages/workers/wrangler.toml`, `packages/client/public/oidc.json`.
 *
 * These are **derived** artifacts now. The cluster Secret is the source of truth; this function exists so
 * client dev and the workers runtime on the host stay in step without anyone hand-editing IDs.
 */
async function pullHostIdentity() {
  const raw = must("kubectl", ["-n", NS, "get", "secret", "noname-env", "-o", "json"]).out;
  const secret = JSON.parse(raw);
  const value = (key) => {
    const encoded = secret.data?.[key];
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : undefined;
  };

  const issuer = value("ZITADEL_ISSUER");
  const clientId = value("ZITADEL_CLIENT_ID");
  const projectId = value("ZITADEL_PROJECT_ID");
  const orgId = value("ZITADEL_DEMO_ORG_ID");
  if (!clientId || !projectId) throw new Error("Secret has no ZITADEL_CLIENT_ID / ZITADEL_PROJECT_ID");

  const upsert = (text, key, val) =>
    new RegExp(`^${key}=.*$`, "m").test(text)
      ? text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${val}`)
      : `${text.trimEnd()}\n${key}=${val}\n`;

  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    let env = readFileSync(envPath, "utf8");
    env = upsert(env, "ZITADEL_ISSUER", issuer);
    env = upsert(env, "ZITADEL_CLIENT_ID", clientId);
    env = upsert(env, "ZITADEL_PROJECT_ID", projectId);
    if (orgId) env = upsert(env, "ZITADEL_DEMO_ORG_ID", orgId);
    writeFileSync(envPath, env);
    ok(".env updated");
  }

  const wranglerPath = join(ROOT, "packages/workers/wrangler.toml");
  if (existsSync(wranglerPath)) {
    let wrangler = readFileSync(wranglerPath, "utf8");
    wrangler = wrangler.replace(/^ZITADEL_CLIENT_ID = ".*"$/m, `ZITADEL_CLIENT_ID = "${clientId}"`);
    wrangler = wrangler.replace(/^ZITADEL_PROJECT_ID = ".*"$/m, `ZITADEL_PROJECT_ID = "${projectId}"`);
    writeFileSync(wranglerPath, wrangler);
    ok("wrangler.toml updated");
  }

  const oidcPath = join(ROOT, "packages/client/public/oidc.json");
  if (existsSync(oidcPath)) {
    const oidc = JSON.parse(readFileSync(oidcPath, "utf8"));
    oidc.issuer = issuer;
    oidc.clientId = clientId;
    writeFileSync(oidcPath, `${JSON.stringify(oidc, null, 2)}\n`);
    ok("oidc.json updated");
  }
}

// ── nodeports: host → cluster infra, and the .env rewrite that goes with it ──────────────────────
/**
 * The NodePort map. Fixed numbers so `.env` never has to guess, and so the rewrite below is a lookup rather
 * than a search.
 *
 * 9000 is deliberately NOT in this list: clickhouse's native port and s3's HTTP port are both 9000, so a blind
 * port rewrite is ambiguous. In the env files port 9000 only ever means s3 (R2_ENDPOINT/R2_PUBLIC_URL), and
 * rewriting it as clickhouse put the wrong Service in the cluster Secret - observed as
 * `R2_ENDPOINT=http://clickhouse:9000`, which uploads would have failed against.
 *
 * ZITADEL is absent on purpose: `ZITADEL_ISSUER` is `http://localhost:8080` and that name is baked into every
 * token, so it stays on a port-forward. See deploy/overlays/local/kustomization.yaml.
 */
const NODEPORTS = [
  { service: "postgres", from: 5432, to: 30432, label: "postgres" },
  { service: "dragonfly", from: 6379, to: 30379, label: "dragonfly (redis)" },
  { service: "clickhouse", from: 8123, to: 30123, label: "clickhouse http" },
  { service: "s3", from: 9000, to: 30900, label: "s3 (s3rver)" },
  { service: "vault", from: 8200, to: 30200, label: "vault" },
  { service: "keto", from: 4466, to: 30466, label: "keto read" },
  { service: "keto", from: 4467, to: 30467, label: "keto write" },
  { service: "nango", from: 3003, to: 30003, label: "nango server" },
  { service: "nango", from: 3009, to: 30009, label: "nango connect" },
  { service: "jaeger", from: 16686, to: 30686, label: "jaeger UI" },
  { service: "jaeger", from: 4318, to: 30431, label: "jaeger OTLP" },
];

/** The .env files the server actually reads (root wins, package-local fills gaps — see load-env.ts). */
const ENV_FILES = [".env", "packages/server/.env"];

function nodeAddress() {
  const raw = must("kubectl", ["get", "nodes", "-o", "json"]).out;
  const nodes = JSON.parse(raw).items ?? [];
  for (const node of nodes) {
    const internal = (node.status?.addresses ?? []).find((a) => a.type === "InternalIP");
    if (internal?.address) return internal.address;
  }
  throw new Error("no InternalIP on any node");
}

/**
 * Rewrite infra addresses in the env files.
 *
 * `--revert` matches *any* IPv4 + NodePort, not the remembered one, so it still works after WSL renumbers the
 * node — which it does on every reboot.
 */
function rewriteEnv({ toNode, ip }) {
  let touched = 0;
  for (const file of ENV_FILES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    const before = text;
    for (const { from, to } of NODEPORTS) {
      if (toNode) {
        text = text
          .replace(new RegExp(`localhost:${from}\\b`, "g"), `${ip}:${to}`)
          .replace(new RegExp(`127\\.0\\.0\\.1:${from}\\b`, "g"), `${ip}:${to}`);
      } else {
        text = text.replace(new RegExp(`\\b\\d{1,3}(?:\\.\\d{1,3}){3}:${to}\\b`, "g"), `localhost:${from}`);
      }
    }
    if (text !== before) {
      writeFileSync(path, text);
      touched += 1;
      ok(`${file} rewritten`);
    }
  }
  return touched;
}

async function nodeports({ revert = false } = {}) {
  step("node address");
  const ip = nodeAddress();
  ok(ip);

  if (revert) {
    step("revert the env files to localhost");
    const n = rewriteEnv({ toNode: false, ip });
    if (n === 0) info("nothing to revert — already using localhost");
    info("port-forwards are the way back: `kubectl -n noname port-forward svc/<name> <port>:<port>`");
    return 0;
  }

  step("apply the local overlay (it carries the NodePort patches)");
  must("kubectl", ["apply", "-k", "deploy/overlays/local"]);
  for (const { service } of NODEPORTS) {
    const r = sh("kubectl", ["-n", NS, "get", "svc", service, "-o",
      "jsonpath={.spec.ports[*].nodePort}"]);
    if (!r.out.trim()) info(`svc/${service} has no nodePort yet`);
  }
  ok("services patched");

  step(`nodePort map (${ip})`);
  for (const { label, from, to } of NODEPORTS) {
    console.log(`   ${label.padEnd(20)} ${String(from).padStart(5)} → ${String(to).padStart(5)}`);
  }
  console.log(`   ${"zitadel".padEnd(20)} ${"8080".padStart(5)} → port-forward (issuer must stay localhost)`);

  step("rewrite the env files");
  const n = rewriteEnv({ toNode: true, ip });
  ok(`${n} file(s) rewritten to ${ip}`);

  step("reachability");
  for (const { label, to } of NODEPORTS) {
    const probe = sh("node", ["-e",
      `const s=require('node:net').connect({host:'${ip}',port:${to},timeout:2000});` +
      `s.on('connect',()=>{s.end();process.exit(0)});` +
      `s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)});`]);
    console.log(`   ${probe.ok ? c.green("ok") : c.red("FAIL")}   ${label} ${ip}:${to}`);
  }

  step("what still needs a port-forward");
  info("zitadel:8080 — the issuer name is baked into every token; `kubectl -n noname port-forward svc/zitadel 8080:8080`");
  info(`after a reboot the node IP changes: re-run this command (revert is not needed)`);
  return 0;
}

// ── smoke: does the whole chain actually work end to end ─────────────────────────────────────────
/**
 * End-to-end verification of the *running* platform, including the parts a unit test cannot reach.
 *
 * The chain a real request takes locally:
 *
 *   browser -> client (5173, host) -> edge (8787, host, wrangler dev) -> api (3000, cluster) -> postgres/...
 *
 * So this opens port-forwards for the cluster side, then walks the chain hop by hop. It deliberately asserts
 * *negative* results where they are the correct outcome (an unsigned `/api` call must be 401, an unsigned
 * webhook must be 4xx) - a 200 there would mean the auth or signature gate is missing.
 */
async function smoke() {
  const forwards = [
    ["svc/api", "3000:3000", "http://127.0.0.1:3000/health"],
    ["svc/zitadel", "8080:8080", "http://localhost:8080/.well-known/openid-configuration"],
    ["svc/browser", "9222:3000", "http://127.0.0.1:9222/json/version"],
  ];
  const children = [];
  const results = [];

  const record = (name, pass, detail) => {
    results.push({ name, pass });
    console.log(`  [${pass ? c.green(" OK ") : c.red("FAIL")}] ${name.padEnd(28)} ${String(detail).slice(0, 68)}`);
  };

  const fetchText = async (url, init) => {
    const r = sh("node", ["-e",
      `fetch(${JSON.stringify(url)},${JSON.stringify(init ?? {})})` +
      `.then(async r=>{const t=await r.text();process.stdout.write(r.status+' '+t.slice(0,110))})` +
      `.catch(e=>{process.stdout.write('ERR '+e.message)})`]);
    return r.out || r.err || "no output";
  };

  step("open the cluster-side hops");
  for (const [target, ports, probeUrl] of forwards) {
    const child = spawnSync("kubectl", ["-n", NS, "port-forward", target, ports], {
      cwd: ROOT, env, detached: true, stdio: "ignore",
    });
    if (child.pid) children.push(child.pid);
    await waitFor(target, () => {
      const r = sh("node", ["-e",
        `fetch(${JSON.stringify(probeUrl)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`]);
      return r.ok;
    }, { timeoutMs: 30_000, intervalMs: 1_000 });
  }

  try {
    step("cluster: api, identity, browser fleet");
    const health = await fetchText("http://127.0.0.1:3000/health");
    record("api /health", /^200/.test(health), health);
    const ready = await fetchText("http://127.0.0.1:3000/ready");
    record("api /ready", /"ready":true/.test(ready), ready);
    const discovery = await fetchText("http://localhost:8080/.well-known/openid-configuration");
    record("zitadel discovery", /^200/.test(discovery), "issuer reachable");
    const cdp = await fetchText("http://127.0.0.1:9222/json/version");
    record("browser CDP", /^200/.test(cdp) && /Protocol-Version/.test(cdp), cdp);

    step("negative controls (these MUST be rejected)");
    const unsignedApi = await fetchText("http://127.0.0.1:3000/api/tenants/resolve/demo");
    record("api unsigned /api", /^401|^403/.test(unsignedApi), unsignedApi);
    const unsignedWebhook = await fetchText("http://127.0.0.1:3000/api/webhooks/generic",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    record("webhook unsigned", /^4\d\d/.test(unsignedWebhook), unsignedWebhook);

    step("through the edge (needs `pnpm --filter @noname/workers dev`)");
    const edgeHealth = await fetchText("http://127.0.0.1:8787/health");
    if (!/^200/.test(edgeHealth)) {
      info("edge not running - start it with: pnpm --filter @noname/workers dev");
      info("through-edge checks skipped (the edge is a host process, see docs/2026-10-31/EDGE.md)");
    } else {
      record("edge /health", true, edgeHealth);
      const edgeApi = await fetchText("http://127.0.0.1:8787/api/health");
      record("edge /api unsigned", /^401|^403/.test(edgeApi), `${edgeApi} - auth gate works`);
      const edgeRoot = await fetchText("http://127.0.0.1:8787/",
        { headers: { Host: "yogastore.localhost" } });
      // 200 = SSR/SPA served, 503 = bucket not seeded. Both prove the worker routed the request.
      record("edge serves /", /^200|^503/.test(edgeRoot), edgeRoot);
    }

    step("client (needs `pnpm --filter @noname/client dev`)");
    const client = await fetchText("http://127.0.0.1:5173/");
    record("client dev server", /^200/.test(client), /^200/.test(client) ? "200" : `${client} - not running?`);
  } finally {
    for (const pid of children) {
      try {
        if (IS_WIN) sh("taskkill", ["/PID", String(pid), "/T", "/F"]);
        else process.kill(-pid);
      } catch {
        /* already gone */
      }
    }
    info("port-forwards closed");
  }

  const failed = results.filter((r) => !r.pass);
  console.log("");
  if (failed.length === 0) {
    console.log(c.green("  chain verified end to end"));
    return 0;
  }
  console.log(c.red(`  ${failed.length} check(s) failed: ${failed.map((f) => f.name).join(", ")}`));
  return 1;
}

// ── seed ─────────────────────────────────────────────────────────────────────────────────────────
async function seed() {
  step("seed Job");
  sh("kubectl", ["-n", NS, "delete", "job", "seed", "--ignore-not-found"]);
  must("kubectl", ["apply", "-f", "deploy/base/jobs/seed.yaml"]);
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
      code = await identity({ yes: flags.has("--yes") });
      break;
    case "pull":
      await pullHostIdentity();
      code = 0;
      break;
    case "smoke":
      code = await smoke();
      break;
    case "nodeports":
      code = await nodeports({ revert: flags.has("--revert") });
      break;
    case "seed":
      code = await seed();
      break;
    case "down":
      code = down();
      break;
    default:
      console.log(
        `usage: node scripts/k8s.mjs <status|up|smoke|nodeports|identity|pull|seed|down> [--rebuild] [--skip-images] [--yes]`,
      );
      code = 1;
  }
  process.exit(code);
} catch (error) {
  console.error(`\n${c.red("FAILED")} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
