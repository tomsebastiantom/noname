import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  type EvalCacheInputs,
  evalCacheKey,
  evalRunKey,
  hashValue,
  isCacheableResult,
  isCacheableRun,
} from "./cache";

const inputs: EvalCacheInputs = {
  orgId: "org-1",
  tenantSlug: "yogastore",
  route: "/products",
  specHash: "spec-a",
  releaseId: "r_1",
  platformVersion: "v1",
  browserFleetVersion: "chrome-140",
  checksVersion: "checks-1",
};

describe("canonicalJson", () => {
  it("is independent of object key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("drops undefined but preserves array order", () => {
    expect(canonicalJson({ a: undefined, b: [1, 2] })).toBe('{"b":[1,2]}');
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("hashes equal specs equally", () => {
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
  });
});

describe("evalCacheKey", () => {
  it("is stable for identical inputs", () => {
    expect(evalCacheKey({ ...inputs })).toBe(evalCacheKey({ ...inputs }));
  });

  it.each([
    ["orgId", "org-2"],
    ["tenantSlug", "other"],
    ["route", "/cart"],
    ["specHash", "spec-b"],
    ["releaseId", "r_2"],
    ["platformVersion", "v2"],
    ["browserFleetVersion", "chrome-141"],
    ["checksVersion", "checks-2"],
  ] as const)("changes when %s changes", (field, value) => {
    expect(evalCacheKey({ ...inputs, [field]: value })).not.toBe(evalCacheKey(inputs));
  });
});

describe("cacheable results", () => {
  it("caches a passing read-only check", () => {
    expect(isCacheableResult("R1.resolve", "pass")).toBe(true);
    expect(isCacheableResult("B1.render", "pass")).toBe(true);
  });

  it("never caches a failure or a skip", () => {
    expect(isCacheableResult("R1.resolve", "fail")).toBe(false);
    expect(isCacheableResult("R1.resolve", "skip")).toBe(false);
  });

  it("never caches a side-effecting check", () => {
    expect(isCacheableResult("B5.behaviour", "pass")).toBe(false);
  });
});

describe("evalRunKey", () => {
  const run = {
    orgId: "org-1",
    tenantSlug: "yogastore",
    releaseId: "r_1",
    platformVersion: "v1",
    browserFleetVersion: "chrome-140",
    checksVersion: "checks-1",
    routeHashes: { home: "a1", products: "b2" },
  };

  it("is stable for identical inputs and independent of route order", () => {
    expect(evalRunKey(run)).toBe(
      evalRunKey({ ...run, routeHashes: { products: "b2", home: "a1" } }),
    );
  });

  it("changes when one route changes", () => {
    expect(evalRunKey(run)).not.toBe(
      evalRunKey({ ...run, routeHashes: { ...run.routeHashes, products: "b3" } }),
    );
  });

  it("changes for release, platform and browser changes", () => {
    for (const patch of [
      { releaseId: "r_2" },
      { platformVersion: "v2" },
      { browserFleetVersion: "chrome-141" },
      { checksVersion: "checks-2" },
    ]) {
      expect(evalRunKey({ ...run, ...patch })).not.toBe(evalRunKey(run));
    }
  });
});

describe("cacheable runs", () => {
  it("caches a clean pass", () => {
    expect(isCacheableRun({ passed: true, counts: { fail: 0, unverified: 0 } })).toBe(true);
  });

  it("never caches a failure or an unverified run", () => {
    expect(isCacheableRun({ passed: false, counts: { fail: 1, unverified: 0 } })).toBe(false);
    expect(isCacheableRun({ passed: true, counts: { fail: 0, unverified: 1 } })).toBe(false);
  });
});
