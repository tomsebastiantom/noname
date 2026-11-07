import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const contentCheck = browserChecks.filter((check) => check.meta.id === "B4.content");

type SpecElement = { type?: string; props?: Record<string, unknown> };

function clientWithSpec(elements: Record<string, SpecElement> | null): EvalClient {
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

function browserWith(text: string, title = "Noname"): BrowserObserver {
  return {
    async visit() {
      return {
        url: "http://yogastore.test/",
        status: 200,
        title,
        width: 1280,
        textLength: text.length,
        text,
        sample: text.slice(0, 300),
        nodesByType: {},
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
  const { evaluateChecks } = await import("../index");
  return evaluateChecks(contentCheck, context(client, browser));
}

const spec = {
  hero: { type: "Hero", props: { title: "Welcome to Noname" } },
  card: { type: "ProductCard", props: { title: "Blue Sneakers", price: 99.99 } },
  intro: { type: "TextBase", props: { content: "Comfortable running shoes." } },
};

describe("B4.content", () => {
  it("passes when titles, copy and price are visible", async () => {
    const result = await run(
      clientWithSpec(spec),
      browserWith("Welcome to Noname Blue Sneakers $99.99 Comfortable running shoes."),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "B4.content", status: "pass" });
    expect(result.checks[0]?.detail).toContain("4 content value(s) visible");
  });

  it("fails when the price is not visible", async () => {
    const result = await run(
      clientWithSpec(spec),
      browserWith("Welcome to Noname Blue Sneakers Comfortable running shoes."),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("99.99");
  });

  it("fails when the page has no document title", async () => {
    const result = await run(clientWithSpec(spec), browserWith("Welcome to Noname", ""));

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("no document title");
  });

  it("skips — never passes — without a browser", async () => {
    const result = await run(clientWithSpec(spec));

    expect(result.checks[0]).toMatchObject({ id: "B4.content", status: "skip", level: "error" });
  });

  it("skips when the spec cannot be read", async () => {
    const result = await run(clientWithSpec(null), browserWith("Welcome"));

    expect(result.checks[0]).toMatchObject({ id: "B4.content", status: "skip", level: "error" });
  });
});
