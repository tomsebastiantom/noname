import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CHECK_REGISTRY, evaluate, evaluateChecks, manifestChecks } from "./index";
import { assertRegistryIntegrity } from "./registry";
import type { Check, CheckContext, EvalClient, ManifestObservation } from "./types";

const machinesDir = mkdtempSync(join(tmpdir(), "eval-registry-"));

writeFileSync(
  join(machinesDir, "cart.json"),
  JSON.stringify({
    name: "cart",
    states: {
      idle: { on: { start: { target: "running" } } },
      running: { on: { finish: { target: "done" } } },
      done: {},
    },
  }),
);

afterAll(() => rmSync(machinesDir, { recursive: true, force: true }));

const storedCart = {
  name: "cart",
  states: {
    idle: { on: { start: { target: "running" } } },
    running: { on: { finish: { target: "done" } } },
    done: {},
  },
};

/** Minimal API double: every check goes through this, so no network is involved. */
const client: EvalClient = {
  async getJson<T>(path: string) {
    if (path === "/api/documents/layout") {
      return {
        ok: true as const,
        data: {
          data: [
            {
              key: "home",
              status: "published",
              data: { spec: { elements: { a: { type: "TextBase", props: { content: "Hi" } } } } },
            },
          ],
        } as T,
      };
    }
    if (path === "/api/documents/routing/pages") {
      return {
        ok: true as const,
        data: { data: [{ key: "p1", layoutRef: "home", status: "published" }] } as T,
      };
    }
    if (path === "/api/documents/content-types") {
      return {
        ok: true as const,
        data: {
          data: [
            {
              name: "product",
              schema: {
                fields: [{ key: "category", type: "reference", references: "category" }],
              },
            },
            { name: "category", schema: { fields: [] } },
          ],
        } as T,
      };
    }
    if (path.includes("_eval_probe_")) {
      return { ok: false as const, status: 404, error: "HTTP 404" };
    }
    if (path.startsWith("/api/machines/definitions/")) {
      return { ok: true as const, data: { data: storedCart } as T };
    }
    if (path === "/api/documents/page_tree/main") {
      return {
        ok: true as const,
        data: { data: { pages: [{ id: "p1", pageId: "p1", slug: { "en-US": "/" } }] } } as T,
      };
    }
    if (path.startsWith("/api/edge/schema/")) {
      return {
        ok: true as const,
        data: {
          data: {
            templateName: "home",
            layout: {
              elements: {
                a: { type: "TextBase" },
                b: { type: "GridBase" },
                c: { type: "ButtonBase" },
              },
            },
          },
        } as T,
      };
    }
    return { ok: false as const, status: 404, error: `unhandled ${path}` };
  },
};

function context(): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir,
    maxRoutes: 20,
    canReadDefinitions: true,
  };
}

describe("check registry", () => {
  it("has unique group ids and unique emitted result ids", () => {
    expect(() => assertRegistryIntegrity(CHECK_REGISTRY)).not.toThrow();
    const emitted = CHECK_REGISTRY.flatMap((check) => check.meta.emits);
    expect(new Set(emitted).size).toBe(emitted.length);
  });

  it("rejects a duplicate result id", () => {
    const a: Check = {
      meta: {
        id: "X1.a",
        tier: 0,
        defaultLevel: "error",
        needs: ["api"],
        emits: ["X1.a"],
        description: "fake",
      },
      async run() {
        return [];
      },
    };
    const b: Check = {
      meta: { ...a.meta, id: "X1.b", emits: ["X1.a"] },
      async run() {
        return [];
      },
    };
    expect(() => assertRegistryIntegrity([a, b])).toThrow(/emitted by both/);
  });

  it("runs the full catalogue against a fake API with no browser", async () => {
    const result = await evaluate(context());

    expect(result.passed).toBe(true);
    expect(result.counts.fail).toBe(0);
    expect(result.counts.skip).toBe(2); // B1.render + B2.console
    expect(
      result.checks.filter((c) => c.id.startsWith("B")).every((c) => c.status === "skip"),
    ).toBe(true);
    expect(result.checks.some((c) => c.id === "M4.machines" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.id === "M1.references" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.id === "M3.reachability" && c.status === "pass")).toBe(true);
    expect(
      result.checks.some(
        (c) => c.id === "M5.vocabulary" && c.subject === "home" && c.status === "pass",
      ),
    ).toBe(true);
    expect(result.checks.some((c) => c.id === "R2.blocks" && c.status === "pass")).toBe(true);
  });
});

describe("manifest checks are pure", () => {
  const definition = {
    name: "cart",
    states: {
      idle: { on: { start: { target: "running" } } },
      running: {},
    },
  };

  const observation: ManifestObservation = {
    files: [definition],
    stored: { cart: definition },
    canReadDefinitions: true,
  };

  const explodingClient: EvalClient = {
    async getJson() {
      throw new Error("a pure check must not reach the network");
    },
  };

  it("runs M4/M5 from an observation without touching the filesystem or the API", async () => {
    const result = await evaluateChecks(manifestChecks, {
      ...context(),
      client: explodingClient,
      machinesDir: "Z:\\this-directory-does-not-exist",
      manifest: observation,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.map((check) => check.id).sort()).toEqual(["M4.machines", "M5.vocabulary"]);
  });

  it("fails M4 on transition drift inside the observation", async () => {
    const drifted = {
      ...definition,
      states: {
        idle: { on: { start: { target: "paused" } } },
        running: {},
      },
    };
    const result = await evaluateChecks(manifestChecks, {
      ...context(),
      manifest: { ...observation, stored: { cart: drifted } },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "M4.machines")?.status).toBe("fail");
  });

  it("skips — never passes — when the caller has no credential", async () => {
    const result = await evaluateChecks(manifestChecks, {
      ...context(),
      canReadDefinitions: false,
      manifest: { files: [definition], stored: {}, canReadDefinitions: false },
    });

    const registrations = result.checks.filter((check) => check.detail.includes("MACHINES_DEFINE"));
    expect(registrations.length).toBeGreaterThan(0);
    expect(registrations.every((check) => check.status === "skip")).toBe(true);
    expect(result.passed).toBe(true);
  });
});

describe("evaluateChecks", () => {
  const failing: Check = {
    meta: {
      id: "Z1.fail",
      tier: 0,
      defaultLevel: "error",
      needs: [],
      emits: ["Z1.fail"],
      description: "fake failing check",
    },
    async run() {
      return [{ id: "Z1.fail", status: "fail", level: "error", detail: "broken" }];
    },
  };

  const warning: Check = {
    meta: {
      id: "Z2.warn",
      tier: 0,
      defaultLevel: "warn",
      needs: [],
      emits: ["Z2.warn"],
      description: "fake warning check",
    },
    async run() {
      return [{ id: "Z2.warn", status: "fail", level: "warn", detail: "advisory" }];
    },
  };

  const crashing: Check = {
    meta: {
      id: "Z3.crash",
      tier: 0,
      defaultLevel: "error",
      needs: [],
      emits: ["Z3.crash"],
      description: "fake crashing check",
    },
    async run() {
      throw new Error("boom");
    },
  };

  it("derives passed from error failures only", async () => {
    const result = await evaluateChecks([warning], context());
    expect(result.passed).toBe(true);
    expect(result.counts.fail).toBe(1);
  });

  it("blocks on an error failure", async () => {
    const result = await evaluateChecks([failing], context());
    expect(result.passed).toBe(false);
  });

  it("reports a crash as skip, never pass", async () => {
    const result = await evaluateChecks([crashing], context());
    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "Z3.crash", status: "skip", level: "error" });
  });
});
