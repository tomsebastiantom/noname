import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const structureCheck = browserChecks.filter((check) => check.meta.id === "B1.structure");

function clientWithSpec(elements: Record<string, { type?: string }> | null): EvalClient {
  return {
    async getJson<T>(path: string) {
      if (!path.startsWith("/api/edge/schema/")) {
        return { ok: false as const, status: 404, error: `unhandled ${path}` };
      }
      if (elements === null) return { ok: false as const, status: 500, error: "HTTP 500" };
      return { ok: true as const, data: { data: { layout: { elements } } } as T };
    },
  };
}

function browserWith(nodesByType: Record<string, number>): BrowserObserver {
  return {
    async visit() {
      return {
        url: "http://yogastore.test/",
        status: 200,
        title: "Noname",
        width: 1280,
        textLength: 200,
        text: "rendered",
        sample: "rendered",
        nodesByType,
        consoleErrors: [],
      };
    },
    async close() {},
  };
}

function context(client: EvalClient, browser?: BrowserObserver): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
    browser,
    siteBase: browser ? "http://yogastore.test" : undefined,
  };
}

async function run(client: EvalClient, browser?: BrowserObserver) {
  // evaluateChecks is the same runner the CLI uses; only the structure check is selected here.
  const { evaluateChecks } = await import("../index");
  return evaluateChecks(structureCheck, context(client, browser));
}

describe("B1.structure", () => {
  it("passes when the DOM counts match the spec", async () => {
    const result = await run(
      clientWithSpec({ a: { type: "Hero" }, b: { type: "GridBase" } }),
      browserWith({ Hero: 1, GridBase: 1 }),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "B1.structure", status: "pass" });
    expect(result.checks[0]?.detail).toContain("2 block(s)");
  });

  it("fails when a block is missing from the DOM", async () => {
    const result = await run(
      clientWithSpec({ a: { type: "Hero" }, b: { type: "GridBase" } }),
      browserWith({ Hero: 1 }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("GridBase: spec 1, DOM 0");
  });

  it("fails when the DOM renders an extra block type", async () => {
    const result = await run(
      clientWithSpec({ a: { type: "Hero" } }),
      browserWith({ Hero: 1, Mystery: 1 }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("Mystery: spec 0, DOM 1");
  });

  it("skips — never passes — without a browser", async () => {
    const result = await run(clientWithSpec({ a: { type: "Hero" } }));

    expect(result.checks[0]).toMatchObject({ id: "B1.structure", status: "skip", level: "error" });
  });

  it("skips when the spec cannot be read", async () => {
    const result = await run(clientWithSpec(null), browserWith({ Hero: 1 }));

    expect(result.checks[0]).toMatchObject({ id: "B1.structure", status: "skip", level: "error" });
  });
});
