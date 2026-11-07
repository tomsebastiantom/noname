import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient, ManifestObservation } from "../types";
import { manifestChecks } from "./manifest";

type Layout = {
  key: string;
  status: string;
  elements: Record<string, { type?: string; props?: unknown }>;
};

function context(options: {
  layouts?: Layout[] | null;
  canReadDefinitions?: boolean;
}): CheckContext {
  const canReadDefinitions = options.canReadDefinitions ?? true;
  const manifest: ManifestObservation = {
    files: [],
    stored: {},
    canReadDefinitions,
  };

  const client: EvalClient = {
    async getJson<T>(path: string) {
      if (path === "/api/documents/layout") {
        if (options.layouts === null) return { ok: false as const, status: 500, error: "HTTP 500" };
        return {
          ok: true as const,
          data: {
            data: (options.layouts ?? []).map((layout) => ({
              key: layout.key,
              status: layout.status,
              data: { spec: { elements: layout.elements } },
            })),
          } as T,
        };
      }
      return { ok: false as const, status: 404, error: `unhandled ${path}` };
    },
  };

  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions,
    manifest,
  };
}

async function run(options: Parameters<typeof context>[0]) {
  return evaluateChecks(manifestChecks, context(options));
}

describe("M5.vocabulary — block catalogue", () => {
  it("passes when every published block is in the catalog", async () => {
    const result = await run({
      layouts: [
        {
          key: "home",
          status: "published",
          elements: { a: { type: "TextBase", props: { content: "Hi" } } },
        },
      ],
    });

    expect(
      result.checks.some((check) => check.id === "M5.vocabulary" && check.subject === "home"),
    ).toBe(true);
    expect(result.checks.find((check) => check.subject === "home")?.status).toBe("pass");
  });

  it("fails on an unknown block type", async () => {
    const result = await run({
      layouts: [{ key: "home", status: "published", elements: { a: { type: "MysteryBlock" } } }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.subject === "home")?.detail).toContain(
      "unknown block type",
    );
  });

  it("fails on invalid props", async () => {
    const result = await run({
      layouts: [
        { key: "home", status: "published", elements: { a: { type: "TextBase", props: {} } } },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.subject === "home")?.detail).toContain(
      "invalid props",
    );
  });

  it("ignores drafts", async () => {
    const result = await run({
      layouts: [{ key: "wip", status: "draft", elements: { a: { type: "MysteryBlock" } } }],
    });

    expect(result.passed).toBe(true);
    expect(result.checks.some((check) => check.subject === "wip")).toBe(false);
  });

  it("skips — never passes — when layouts cannot be listed", async () => {
    const result = await run({ layouts: null });

    expect(
      result.checks.some((check) => check.id === "M5.vocabulary" && check.status === "skip"),
    ).toBe(true);
  });

  it("still checks block vocabulary when the caller has no definition credential", async () => {
    const result = await run({
      canReadDefinitions: false,
      layouts: [
        {
          key: "home",
          status: "published",
          elements: { a: { type: "TextBase", props: { content: "Hi" } } },
        },
      ],
    });

    const checks = result.checks.filter((check) => check.id === "M5.vocabulary");
    expect(checks.some((check) => check.status === "skip")).toBe(true); // registration
    expect(checks.some((check) => check.subject === "home" && check.status === "pass")).toBe(true);
  });
});
