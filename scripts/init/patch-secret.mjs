#!/usr/bin/env node
/**
 * Merge an env file into the `noname-env` Secret, then restart the workloads that consume it.
 *
 * Runs **inside the cluster** as part of the identity Job (deploy/jobs/identity.yaml). It talks to the
 * Kubernetes API directly with the pod's ServiceAccount token — no `kubectl` binary, no image changes,
 * no host involvement. That is what removes the last manual step: previously identity provisioning ran on
 * a developer machine against a `kubectl port-forward`, and the results were copied into the Secret by
 * hand (and into `.env`, `wrangler.toml` and `oidc.json`).
 *
 * RBAC is deliberately narrow (deploy/jobs/identity.yaml): get/patch on this one Secret, and patch on the
 * two Deployments so they roll. Nothing cluster-wide.
 *
 * Usage: node scripts/init/patch-secret.mjs /work/identity.env
 */
import { readFileSync } from "node:fs";

const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";
const NAMESPACE = readFileSync(`${SA_DIR}/namespace`, "utf8").trim();
const TOKEN = readFileSync(`${SA_DIR}/token`, "utf8").trim();
const API = "https://kubernetes.default.svc";
const SECRET = "noname-env";
const RESTART_DEPLOYMENTS = ["api", "worker"];

const envFile = process.argv[2];
if (!envFile) {
  console.error("usage: patch-secret.mjs <env-file>");
  process.exit(2);
}

/** Parse KEY=VALUE lines, ignoring comments and blanks. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

async function k8s(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/merge-patch+json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

const wanted = parseEnv(readFileSync(envFile, "utf8"));
if (Object.keys(wanted).length === 0) {
  console.error("env file produced no keys — nothing to patch");
  process.exit(1);
}
console.log(`keys from ${envFile}: ${Object.keys(wanted).join(", ")}`);

// Merge patch: only the keys we own are sent, so unrelated keys in the Secret are untouched. This is the
// lesson from the earlier incident where applying a manifest that declared the whole Secret pruned the
// keys it did not mention.
const data = Object.fromEntries(
  Object.entries(wanted).map(([key, value]) => [key, Buffer.from(value, "utf8").toString("base64")]),
);
await k8s(`/api/v1/namespaces/${NAMESPACE}/secrets/${SECRET}`, { method: "PATCH", body: { data } });
console.log(`patched secret/${SECRET} in ${NAMESPACE}`);

// Secret env vars are only read when a container starts, so the consumers must roll.
const stamp = new Date().toISOString();
for (const deployment of RESTART_DEPLOYMENTS) {
  await k8s(`/apis/apps/v1/namespaces/${NAMESPACE}/deployments/${deployment}`, {
    method: "PATCH",
    body: {
      spec: { template: { metadata: { annotations: { "noname.io/restartedAt": stamp } } } },
    },
  });
  console.log(`restarted deployment/${deployment}`);
}

console.log("done");
