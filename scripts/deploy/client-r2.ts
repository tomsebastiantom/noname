#!/usr/bin/env tsx
/**
 * I2 — Build @noname/client and upload dist/ to R2 under _assets/
 *
 * Usage:
 *   pnpm deploy:client-r2
 *   R2_BUCKET=noname-assets pnpm deploy:client-r2
 *   DEPLOY_R2_LOCAL=1 pnpm deploy:client-r2   # wrangler dev bucket
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "../..");
const distDir = join(repoRoot, "packages/client/dist");
const workersDir = join(repoRoot, "packages/workers");
const wranglerBin = join(workersDir, "node_modules/.bin/wrangler");

const bucket = process.env.R2_BUCKET?.trim() || "noname-assets";
const useLocal = process.env.DEPLOY_R2_LOCAL === "1" || process.env.DEPLOY_R2_LOCAL === "true";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function mimeFor(file: string): string {
  const dot = file.lastIndexOf(".");
  const ext = dot >= 0 ? file.slice(dot).toLowerCase() : "";
  return MIME[ext] ?? "application/octet-stream";
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function run(cmd: string, args: string[], cwd: string): void {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log("Building @noname/client (production)…");
run("pnpm", ["--filter", "@noname/client", "build"], repoRoot);

if (!statSync(distDir).isDirectory()) {
  console.error(`Missing dist at ${distDir}`);
  process.exit(1);
}

const files = walkFiles(distDir);
if (files.length === 0) {
  console.error("dist/ is empty — build failed?");
  process.exit(1);
}

console.log(`Uploading ${files.length} file(s) to R2 bucket "${bucket}" prefix _assets/…`);

for (const file of files) {
  const rel = relative(distDir, file);
  const key = `_assets/${rel}`;
  const args = [
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    file,
    "--content-type",
    mimeFor(file),
  ];
  if (useLocal) args.push("--local");

  console.log(`  → ${key}`);
  run(wranglerBin, args, workersDir);
}

console.log("Done. Smoke:");
console.log(`  cd packages/workers && wrangler dev`);
console.log(`  curl -sI http://localhost:8787/_assets/index.html`);
console.log(`  curl -s -A Googlebot http://yogastore.localhost:8787/`);
