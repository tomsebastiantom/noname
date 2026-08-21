import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { rspack } from "@rspack/core";
import { ValidationError } from "../../../shared/domain-error";

const MAX_SOURCE_BYTES = 100_000;
const BUILD_TIMEOUT_MS = 120_000;
const FORBIDDEN_SOURCE = [
  /child_process/,
  /node:fs/,
  /node:child_process/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
];

export function validateComponentSource(source: string): void {
  if (!source.trim()) {
    throw new ValidationError("source", "source must not be empty");
  }
  if (source.length > MAX_SOURCE_BYTES) {
    throw new ValidationError("source", "source exceeds maximum size");
  }
  for (const pattern of FORBIDDEN_SOURCE) {
    if (pattern.test(source)) {
      throw new ValidationError("source", "source contains forbidden pattern");
    }
  }
}

export interface BundleInput {
  scope: string;
  source: string;
}

export interface BundleOutput {
  remoteEntry: { filename: string; content: Buffer };
  catalog: { filename: string; content: Buffer };
  hash: string;
}

const sharedDeps = {
  react: {
    singleton: true,
    requiredVersion: "^19.0.0",
  },
  "react-dom": {
    singleton: true,
    requiredVersion: "^19.0.0",
  },
  "@json-render/core": {
    singleton: true,
    requiredVersion: "^0.19.0",
  },
  "@json-render/react": {
    singleton: true,
    requiredVersion: "^0.19.0",
  },
};

function generateVirtualEntry(source: string): string {
  return `${source}

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { defineRegistry } from "@json-render/react";

const catalog = defineCatalog(schema, userCatalog);

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: userComponents ?? {},
  actions: userActions ?? {},
});
`;
}

function computeHash(input: BundleInput): string {
  const hash = createHash("sha256");
  hash.update(input.scope);
  hash.update(input.source);
  return hash.digest("hex").slice(0, 16);
}

const pendingBuilds = new Map<string, Promise<BundleOutput>>();

export async function bundleCatalog(input: BundleInput): Promise<BundleOutput> {
  validateComponentSource(input.source);
  const hash = computeHash(input);
  const key = `${input.scope}:${hash}`;

  const existing = pendingBuilds.get(key);
  if (existing) return existing;

  const buildPromise = withBuildTimeout(runBuild(input, hash));
  pendingBuilds.set(key, buildPromise);

  try {
    return await buildPromise;
  } finally {
    pendingBuilds.delete(key);
  }
}

async function runBuild(input: BundleInput, hash: string): Promise<BundleOutput> {
  const tmpDir = mkdtempSync(join(tmpdir(), "noname-catalog-"));
  const virtualEntry = join(tmpDir, "entry.ts");

  writeFileSync(virtualEntry, generateVirtualEntry(input.source));

  const remoteName = input.scope.replace(/[^a-zA-Z0-9_-]/g, "-");

  const compiler = rspack({
    mode: "production",
    target: "web",
    entry: virtualEntry,
    output: {
      filename: "catalog.[contenthash:8].js",
      path: tmpDir,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: { syntax: "typescript", tsx: true },
                transform: { react: { runtime: "automatic" } },
              },
            },
          },
          type: "javascript/auto",
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: remoteName,
        filename: "remoteEntry.js",
        exposes: {
          "./catalog": virtualEntry,
        },
        shared: sharedDeps,
      }),
    ],
    optimization: {
      minimize: true,
    },
    devtool: false,
  });

  return new Promise<BundleOutput>((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        cleanup(tmpDir);
        reject(err);
        return;
      }

      if (!stats || stats.hasErrors()) {
        const errors = stats?.toString({ errors: true, warnings: false }) ?? "Unknown error";
        cleanup(tmpDir);
        reject(new Error(errors));
        return;
      }

      try {
        const { readdirSync } = compiler.outputFileSystem as unknown as {
          readdirSync: (p: string) => string[];
        };
        const files = readdirSync(tmpDir);

        const remoteEntryFile = files.find((f: string) => f === "remoteEntry.js");
        const catalogFile = files.find((f: string) => f !== "remoteEntry.js" && f.endsWith(".js"));

        if (!remoteEntryFile || !catalogFile) {
          cleanup(tmpDir);
          reject(new Error(`Missing output files. Found: ${files.join(", ")}`));
          return;
        }

        const remoteEntryContent = readFileSync(join(tmpDir, remoteEntryFile));
        const catalogContent = readFileSync(join(tmpDir, catalogFile));

        cleanup(tmpDir);

        resolve({
          remoteEntry: { filename: remoteEntryFile, content: remoteEntryContent },
          catalog: { filename: catalogFile, content: catalogContent },
          hash,
        });
      } catch (e) {
        cleanup(tmpDir);
        reject(e);
      }
    });
  });
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function withBuildTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Catalog build timed out")), BUILD_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
