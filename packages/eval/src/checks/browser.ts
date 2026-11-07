import type { Check, CheckResult } from "../types";

/**
 * Tier 2 — browser checks. These are the reason a browser fleet exists, and the reason tier 1 is not enough.
 *
 * Tier 1 (HTTP) can pass while the page is unusable: on 2026-10-31 every HTTP check passed while the storefront
 * rendered `Error: HTTP 400`, because the failure was in the browser's own data path (client → edge → API), not
 * in the API's responses. A check that never opens a page cannot see that.
 *
 * Both checks `skip` — never `pass` — when no browser observer was supplied, so "no browser" can never be
 * mistaken for "verified".
 */

/** Failure text a page renders instead of content. Kept short on purpose: it is a signal, not a scraper. */
const ERROR_MARKERS = /^(error|http \d{3}|something went wrong|failed to load)/i;

function skip(id: string, level: "error" | "warn", reason: string): CheckResult {
  return { id, status: "skip", level, detail: reason };
}

const render: Check = {
  meta: {
    id: "B1.render",
    tier: 2,
    defaultLevel: "error",
    needs: ["browser"],
    emits: ["B1.render"],
    description:
      "the storefront renders real content in a browser, not an error screen or an empty shell",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B1.render", "error", "no browser endpoint supplied — tier 2 not evaluated")];
    }
    const visit = await ctx.browser.visit("/");
    if (visit.status >= 400) {
      return [
        {
          id: "B1.render",
          status: "fail",
          level: "error",
          detail: `storefront returned ${visit.status} in a real browser`,
          subject: "/",
        },
      ];
    }
    // A hydrated SPA renders hundreds of characters of text; an error screen or an empty shell does not.
    if (visit.textLength < 80) {
      return [
        {
          id: "B1.render",
          status: "fail",
          level: "error",
          detail: `page rendered ${visit.textLength} characters — looks like an empty shell, not a storefront`,
          subject: "/",
        },
      ];
    }
    if (ERROR_MARKERS.test(visit.sample)) {
      return [
        {
          id: "B1.render",
          status: "fail",
          level: "error",
          detail: `page shows an error instead of content: "${visit.sample.slice(0, 120)}"`,
          subject: "/",
        },
      ];
    }
    return [
      {
        id: "B1.render",
        status: "pass",
        level: "error",
        detail: `rendered "${visit.title}" (${visit.textLength} chars)`,
        subject: "/",
      },
    ];
  },
};

type SpecResponse = {
  data?: {
    layout?: { elements?: Record<string, { type?: string }> };
  };
};

/**
 * B1.structure — every spec block is rendered, once, as the same type.
 *
 * This is the check the renderer contract exists for: the spec says "three blocks of these types", the DOM
 * says what actually rendered, and a dropped/duplicated/unknown block is a visible failure rather than a
 * screenshot someone has to eyeball.
 */
const structure: Check = {
  meta: {
    id: "B1.structure",
    tier: 2,
    defaultLevel: "error",
    needs: ["api", "browser"],
    emits: ["B1.structure"],
    description: "the rendered DOM contains exactly the blocks the spec declares, by type",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B1.structure", "error", "no browser endpoint supplied — tier 2 not evaluated")];
    }

    const spec = await ctx.client.getJson<SpecResponse>(
      `/api/edge/schema/${encodeURIComponent(ctx.tenantSlug)}?url=${encodeURIComponent("/")}`,
    );
    if (!spec.ok) {
      return [
        skip(
          "B1.structure",
          "error",
          `could not read the spec (${spec.error}) — structure was not compared`,
        ),
      ];
    }

    const expected: Record<string, number> = {};
    for (const element of Object.values(spec.data?.data?.layout?.elements ?? {})) {
      const type =
        typeof element.type === "string" && element.type.trim() ? element.type : "(untyped)";
      expected[type] = (expected[type] ?? 0) + 1;
    }

    const visit = await ctx.browser.visit("/");
    const actual = visit.nodesByType;
    const types = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    const problems: string[] = [];

    for (const type of types) {
      const want = expected[type] ?? 0;
      const got = actual[type] ?? 0;
      if (want !== got) problems.push(`${type}: spec ${want}, DOM ${got}`);
    }

    const total = Object.values(expected).reduce((sum, count) => sum + count, 0);

    return problems.length > 0
      ? [
          {
            id: "B1.structure",
            status: "fail",
            level: "error",
            subject: "/",
            detail:
              `${problems.slice(0, 3).join("; ")}` +
              (problems.length > 3 ? ` (+${problems.length - 3} more)` : ""),
          },
        ]
      : [
          {
            id: "B1.structure",
            status: "pass",
            level: "error",
            subject: "/",
            detail: `${total} block(s) across ${types.size} type(s) match the DOM`,
          },
        ];
  },
};

const consoleClean: Check = {
  meta: {
    id: "B2.console",
    tier: 2,
    defaultLevel: "warn",
    needs: ["browser"],
    emits: ["B2.console"],
    description: "the storefront raises no console errors during a browser visit",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B2.console", "warn", "no browser endpoint supplied — tier 2 not evaluated")];
    }
    const visit = await ctx.browser.visit("/");
    if (visit.consoleErrors.length === 0) {
      return [
        {
          id: "B2.console",
          status: "pass",
          level: "warn",
          detail: "no console errors",
          subject: "/",
        },
      ];
    }
    return [
      {
        id: "B2.console",
        status: "fail",
        level: "warn",
        detail: `${visit.consoleErrors.length} console error(s): ${visit.consoleErrors[0]?.slice(0, 120)}`,
        subject: "/",
      },
    ];
  },
};

export const browserChecks: Check[] = [render, structure, consoleClean];
