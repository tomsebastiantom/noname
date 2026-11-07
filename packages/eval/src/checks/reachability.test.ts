import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { reachabilityChecks } from "./reachability";

type TreeEntry = { id?: string; pageId?: string; slug?: Record<string, string> };
type Page = { key: string; status: string };

function context(client: EvalClient): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

function clientWith(tree: TreeEntry[] | null, pages: Page[]): EvalClient {
  return {
    async getJson<T>(path: string) {
      if (path === "/api/documents/page_tree/main") {
        if (tree === null) return { ok: false as const, status: 404, error: "HTTP 404" };
        return { ok: true as const, data: { data: { pages: tree } } as T };
      }
      if (path === "/api/documents/routing/pages") {
        return { ok: true as const, data: { data: pages } as T };
      }
      return { ok: false as const, status: 404, error: `unhandled ${path}` };
    },
  };
}

async function run(client: EvalClient) {
  return evaluateChecks(reachabilityChecks, context(client));
}

describe("M3.reachability", () => {
  it("passes when every entry and published page line up", async () => {
    const result = await run(
      clientWith(
        [{ id: "e1", pageId: "home", slug: { "en-US": "/" } }],
        [{ key: "home", status: "published" }],
      ),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "M3.reachability", status: "pass" });
  });

  it("fails when a page_tree entry points at a missing page", async () => {
    const result = await run(
      clientWith(
        [{ id: "e1", pageId: "missing", slug: { "en-US": "/missing" } }],
        [{ key: "home", status: "published" }],
      ),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({
      id: "M3.reachability",
      status: "fail",
      subject: "missing",
    });
  });

  it("fails when a published page is absent from page_tree", async () => {
    const result = await run(
      clientWith(
        [{ id: "e1", pageId: "home", slug: { "en-US": "/" } }],
        [
          { key: "home", status: "published" },
          { key: "about", status: "published" },
        ],
      ),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.subject === "about")).toBe(true);
  });

  it("does not require draft pages to be reachable", async () => {
    const result = await run(
      clientWith(
        [{ id: "e1", pageId: "home", slug: { "en-US": "/" } }],
        [
          { key: "home", status: "published" },
          { key: "hidden", status: "draft" },
        ],
      ),
    );

    expect(result.passed).toBe(true);
  });

  it("fails when page_tree itself is missing", async () => {
    const result = await run(clientWith(null, []));

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("does not exist");
  });

  it("fails when an entry has no route", async () => {
    const result = await run(
      clientWith([{ id: "e1", pageId: "home", slug: {} }], [{ key: "home", status: "published" }]),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("no route");
  });
});
