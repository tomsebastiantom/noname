import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { routeChecks } from "./routes";

type Element = { type?: string; props?: Record<string, unknown> };

function context(client: EvalClient): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

function clientWith(options: {
  routing?: Array<{ key: string; layoutRef?: string; contentRef?: string }> | null;
  template?: string;
  elements?: Record<string, Element>;
  layouts?: Array<{ key: string; elements: Record<string, Element> }>;
}): EvalClient {
  const routing =
    options.routing === undefined ? [{ key: "home", layoutRef: "home" }] : options.routing;
  const template = options.template ?? "home";
  const elements = options.elements ?? { a: { type: "Hero" }, b: { type: "GridBase" } };

  return {
    async getJson<T>(path: string) {
      if (path === "/api/documents/page_tree/main") {
        return {
          ok: true as const,
          data: { data: { pages: [{ slug: { "en-US": "/home" }, pageId: "home" }] } } as T,
        };
      }
      if (path === "/api/documents/routing/pages") {
        if (routing === null) return { ok: false as const, status: 500, error: "HTTP 500" };
        return { ok: true as const, data: { data: routing } as T };
      }
      if (path === "/api/documents/layout") {
        return {
          ok: true as const,
          data: {
            data: (options.layouts ?? []).map((layout) => ({
              key: layout.key,
              status: "published",
              data: { spec: { elements: layout.elements } },
            })),
          } as T,
        };
      }
      if (path.includes("_eval_probe_")) {
        return { ok: false as const, status: 404, error: "HTTP 404" };
      }
      if (path.startsWith("/api/edge/schema/")) {
        return {
          ok: true as const,
          data: { data: { templateName: template, layout: { elements } } } as T,
        };
      }
      return { ok: false as const, status: 404, error: `unhandled ${path}` };
    },
  };
}

async function run(client: EvalClient) {
  return evaluateChecks(routeChecks, context(client));
}

describe("R1.resolve / R2.blocks", () => {
  it("passes when the resolved template matches the page declaration", async () => {
    const result = await run(clientWith({}));

    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "R1.resolve")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "R2.blocks")?.status).toBe("pass");
  });

  it("fails R2 when the route renders a different template than the page declares", async () => {
    const result = await run(
      clientWith({ routing: [{ key: "home", layoutRef: "product_detail" }], template: "home" }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "R1.resolve")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "R2.blocks")).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("declares"),
    });
  });

  it("fails R2 when the page renders zero blocks", async () => {
    const result = await run(clientWith({ elements: {} }));

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "R2.blocks")?.detail).toContain("0 blocks");
  });

  it("fails R2 when an element has no block type", async () => {
    const result = await run(clientWith({ elements: { a: { type: "Hero" }, b: {} } }));

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "R2.blocks")?.detail).toContain(
      "no block type",
    );
  });

  it("fails R2 when the page has no routing record", async () => {
    const result = await run(clientWith({ routing: [] }));

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "R2.blocks")?.detail).toContain(
      "no routing record",
    );
  });

  it("skips the template comparison — never passes it — when routing pages cannot be read", async () => {
    const result = await run(clientWith({ routing: null }));

    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "R1.resolve")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "R2.blocks")).toMatchObject({
      status: "skip",
      level: "error",
    });
  });

  it("passes R3 when content-bound props resolve", async () => {
    const result = await run(
      clientWith({
        routing: [{ key: "home", layoutRef: "home", contentRef: "product:1" }],
        elements: { card: { type: "ProductCard", props: { title: "Sneakers", price: 99 } } },
        layouts: [
          {
            key: "home",
            elements: {
              card: {
                type: "ProductCard",
                props: { title: { $state: "/title" }, price: { $state: "/price" } },
              },
            },
          },
        ],
      }),
    );

    expect(result.checks.find((check) => check.id === "R3.content")).toMatchObject({
      status: "pass",
      subject: "/home",
    });
  });

  it("fails R3 when a content-bound prop resolves empty", async () => {
    const result = await run(
      clientWith({
        routing: [{ key: "home", layoutRef: "home", contentRef: "product:1" }],
        elements: { card: { type: "ProductCard", props: { title: "", price: 99 } } },
        layouts: [
          {
            key: "home",
            elements: {
              card: {
                type: "ProductCard",
                props: { title: { $state: "/title" }, price: { $state: "/price" } },
              },
            },
          },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "R3.content")).toMatchObject({
      status: "fail",
      subject: "/home",
    });
    expect(result.checks.find((check) => check.id === "R3.content")?.detail).toContain(
      "card.title",
    );
  });
});
