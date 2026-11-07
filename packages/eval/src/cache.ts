import { createHash } from "node:crypto";
import type { CheckResult } from "./types";

/**
 * Content-addressed cache for eval results.
 *
 * The key is the whole contract: if an input that can change the answer is missing, the cache will reuse a
 * stale result — worse than no cache. The inputs here are deliberately explicit, including the server/platform
 * version and the browser-fleet version, because a server-only release or a Chrome image change is invisible
 * to the tenant's bundle pointer.
 */
export type EvalCacheInputs = {
  orgId: string;
  tenantSlug: string;
  route: string;
  /** Canonical hash of the route's layout/spec — never the rendered DOM. */
  specHash: string;
  /** Tenant→release pointer (D1). */
  releaseId: string;
  /** Server/platform version (D14/D15); a server-only release must invalidate. */
  platformVersion: string;
  /** Chrome/fonts/image of the renderer fleet (D11); rendering can change without a release. */
  browserFleetVersion: string;
  /** Catalogue + assertion config: “what verified means”. */
  checksVersion: string;
};

/**
 * Stable JSON: object keys sorted, `undefined` dropped, array order preserved.
 *
 * Two specs that mean the same thing must hash the same; a timestamp or key order must not change the hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function evalCacheKey(inputs: EvalCacheInputs): string {
  return hashValue([
    inputs.orgId,
    inputs.tenantSlug,
    inputs.route,
    inputs.specHash,
    inputs.releaseId,
    inputs.platformVersion,
    inputs.browserFleetVersion,
    inputs.checksVersion,
  ]);
}

/**
 * Whole-run reuse key: a map of route → spec hash, so any route change invalidates the run. This is the
 * coarse but correct form; per-route reuse is the next optimisation.
 */
export function evalRunKey(inputs: {
  orgId: string;
  tenantSlug: string;
  releaseId: string;
  platformVersion: string;
  browserFleetVersion: string;
  checksVersion: string;
  routeHashes: Record<string, string>;
}): string {
  const routes = Object.keys(inputs.routeHashes)
    .sort()
    .map((route) => [route, inputs.routeHashes[route]]);
  return hashValue([
    inputs.orgId,
    inputs.tenantSlug,
    inputs.releaseId,
    inputs.platformVersion,
    inputs.browserFleetVersion,
    inputs.checksVersion,
    routes,
  ]);
}

/** Same as the run key, without the route map — the prefix for per-check, per-route cache entries. */
export function evalBaseKey(inputs: {
  orgId: string;
  tenantSlug: string;
  releaseId: string;
  platformVersion: string;
  browserFleetVersion: string;
  checksVersion: string;
}): string {
  return hashValue([
    inputs.orgId,
    inputs.tenantSlug,
    inputs.releaseId,
    inputs.platformVersion,
    inputs.browserFleetVersion,
    inputs.checksVersion,
  ]);
}

export type CheckCache = {
  get(key: string): Promise<CheckResult[] | null>;
  put(key: string, results: CheckResult[]): Promise<void>;
};

/**
 * Only read-only checks are cacheable. `B5.behaviour` mutates the cart and must never be replayed from a cache.
 */
export const READ_ONLY_CACHEABLE_CHECKS: ReadonlySet<string> = new Set([
  "R1.resolve",
  "R2.blocks",
  "R3.content",
  "B1.render",
  "B1.structure",
  "B2.overflow",
  "B3.a11y",
  "B4.content",
  "B6.design",
  "B2.console",
  "S1.no_internal_egress",
]);

/**
 * A result may be stored only when it is a pass and the check is safe to replay. Failures and skips are never
 * cached: a cached flake is worse than no cache, and a skip is “we do not know”, not evidence.
 */
export function isCacheableResult(checkId: string, status: string): boolean {
  return status === "pass" && READ_ONLY_CACHEABLE_CHECKS.has(checkId);
}

/**
 * Cache only a clean pass. A run with failures is not a pass; a run with unverified required checks is not
 * evidence of a pass, so it must not be replayed either.
 */
export function isCacheableRun(result: {
  passed: boolean;
  counts: { fail: number; unverified: number };
}): boolean {
  return result.passed && result.counts.fail === 0 && result.counts.unverified === 0;
}
