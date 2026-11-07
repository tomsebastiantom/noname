import type { Check, CheckResult, EgressProbe } from "../types";

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
    layout?: {
      elements?: Record<string, { type?: string; props?: Record<string, unknown> }>;
    };
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

const OVERFLOW_WIDTHS = [375, 768, 1440];

/**
 * B2.overflow — no horizontal overflow at the widths customers actually use.
 *
 * `scrollWidth > clientWidth` means a block pushes the page sideways: on a phone that is a broken layout, and
 * it is invisible to HTTP checks. The widths are fixed on purpose so “verified” always means the same thing.
 */
const overflowCheck: Check = {
  meta: {
    id: "B2.overflow",
    tier: 2,
    defaultLevel: "error",
    needs: ["browser"],
    emits: ["B2.overflow"],
    description: "the page has no horizontal overflow at 375, 768 and 1440 pixels",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B2.overflow", "error", "no browser endpoint supplied — tier 2 not evaluated")];
    }

    const results: CheckResult[] = [];

    for (const width of OVERFLOW_WIDTHS) {
      const visit = await ctx.browser.visit("/", { width });
      if (!visit.overflow) {
        results.push({
          id: "B2.overflow",
          status: "skip",
          level: "error",
          subject: `/${width}`,
          detail: `${width}px: overflow could not be measured — not a pass`,
        });
        continue;
      }

      const excess = visit.overflow.scrollWidth - visit.overflow.clientWidth;
      results.push(
        excess > 1
          ? {
              id: "B2.overflow",
              status: "fail",
              level: "error",
              subject: `/${width}`,
              detail: `horizontal overflow ${excess}px (scroll ${visit.overflow.scrollWidth}, client ${visit.overflow.clientWidth})`,
            }
          : {
              id: "B2.overflow",
              status: "pass",
              level: "error",
              subject: `/${width}`,
              detail: `no overflow (scroll ${visit.overflow.scrollWidth} <= client ${visit.overflow.clientWidth})`,
            },
      );
    }

    return results;
  },
};

/**
 * B3.a11y — accessible names for the elements the RFC names: images, form fields, buttons and links.
 *
 * axe-core runs the rule subset; a violation is a failure. If the audit could not run, the check skips —
 * “we could not look” is never “we looked and it was fine”.
 */
const a11y: Check = {
  meta: {
    id: "B3.a11y",
    tier: 2,
    defaultLevel: "error",
    needs: ["browser"],
    emits: ["B3.a11y"],
    description: "images, form fields, buttons and links have accessible names",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B3.a11y", "error", "no browser endpoint supplied — tier 2 not evaluated")];
    }

    const visit = await ctx.browser.visit("/", { a11y: true });
    if (!visit.a11y) {
      return [skip("B3.a11y", "error", "accessibility results unavailable — not a pass")];
    }

    return visit.a11y.length === 0
      ? [
          {
            id: "B3.a11y",
            status: "pass",
            level: "error",
            subject: "/",
            detail: "no violations in the checked rule set",
          },
        ]
      : [
          {
            id: "B3.a11y",
            status: "fail",
            level: "error",
            subject: "/",
            detail: visit.a11y
              .slice(0, 3)
              .map((violation) => `${violation.id} (${violation.nodes} node(s))`)
              .join("; "),
          },
        ];
  },
};

/**
 * B4.content — the content the page is supposed to show is actually visible.
 *
 * R2/R3 prove the spec resolved; this proves the resolved values reached the screen. Titles, text blocks and
 * prices are collected from the edge-resolved spec, normalised, and looked up in the rendered body text.
 */
const content: Check = {
  meta: {
    id: "B4.content",
    tier: 2,
    defaultLevel: "error",
    needs: ["api", "browser"],
    emits: ["B4.content"],
    description:
      "page title, product name and price from the resolved spec are visible in the browser",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [skip("B4.content", "error", "no browser endpoint supplied — tier 2 not evaluated")];
    }

    const spec = await ctx.client.getJson<SpecResponse>(
      `/api/edge/schema/${encodeURIComponent(ctx.tenantSlug)}?url=${encodeURIComponent("/")}`,
    );
    if (!spec.ok) {
      return [
        skip(
          "B4.content",
          "error",
          `could not read the spec (${spec.error}) — content was not checked`,
        ),
      ];
    }

    const visit = await ctx.browser.visit("/");
    const normalise = (value: string) => value.replace(/\s+/g, " ").trim();

    if (!normalise(visit.title)) {
      return [
        {
          id: "B4.content",
          status: "fail",
          level: "error",
          subject: "/",
          detail: "the page has no document title",
        },
      ];
    }

    const expected = new Set<string>();
    for (const element of Object.values(spec.data?.data?.layout?.elements ?? {})) {
      const props = (element.props ?? {}) as Record<string, unknown>;
      if (typeof props.title === "string" && props.title.trim())
        expected.add(normalise(props.title));
      if (typeof props.content === "string" && props.content.trim())
        expected.add(normalise(props.content));
      if (typeof props.price === "number" && Number.isFinite(props.price)) {
        expected.add(props.price.toFixed(2));
      }
    }

    const body = normalise(visit.text);
    const missing = [...expected].filter((value) => !body.includes(value));

    return missing.length > 0
      ? [
          {
            id: "B4.content",
            status: "fail",
            level: "error",
            subject: "/",
            detail: `missing visible content: ${missing
              .slice(0, 3)
              .map((value) => `"${value.slice(0, 60)}"`)
              .join(", ")}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ""}`,
          },
        ]
      : [
          {
            id: "B4.content",
            status: "pass",
            level: "error",
            subject: "/",
            detail: `${expected.size} content value(s) visible`,
          },
        ];
  },
};

const EGRESS_TARGETS = ["http://127.0.0.1:3000/health", "http://169.254.169.254/latest/meta-data/"];

/**
 * S1.no_internal_egress — the browser must not be able to reach the platform’s own network.
 *
 * This is the security boundary expressed as a check rather than a claim: a page that can fetch the API or the
 * metadata address is an SSRF path. It is `warn` by default because local development browsers run on the host
 * network — a local failure is the expected, honest result until egress policy is enforced (staging/prod).
 *
 * Limit recorded on purpose: `fetch` can probe HTTP(S) only; a raw Redis port cannot be tested this way.
 */
const egress: Check = {
  meta: {
    id: "S1.no_internal_egress",
    tier: 2,
    defaultLevel: "warn",
    needs: ["browser"],
    emits: ["S1.no_internal_egress"],
    description: "the eval browser cannot reach internal platform endpoints",
  },
  async run(ctx) {
    if (!ctx.browser || !ctx.siteBase) {
      return [
        skip("S1.no_internal_egress", "warn", "no browser endpoint supplied — egress not probed"),
      ];
    }
    if (!ctx.browser.probeEgress) {
      return [skip("S1.no_internal_egress", "warn", "observer cannot probe egress — not a pass")];
    }

    let probes: EgressProbe[];
    try {
      probes = await ctx.browser.probeEgress(EGRESS_TARGETS);
    } catch (cause) {
      return [
        skip(
          "S1.no_internal_egress",
          "warn",
          `egress probe failed (${cause instanceof Error ? cause.message : String(cause)}) — not a pass`,
        ),
      ];
    }

    const reachable = probes.filter((probe) => probe.reachable);
    return reachable.length > 0
      ? [
          {
            id: "S1.no_internal_egress",
            status: "fail",
            level: "warn",
            subject: "/",
            detail: `internal endpoint(s) reachable from the browser: ${reachable
              .map((probe) => probe.target)
              .join(", ")}`,
          },
        ]
      : [
          {
            id: "S1.no_internal_egress",
            status: "pass",
            level: "warn",
            subject: "/",
            detail: `${probes.length} internal target(s) unreachable from the browser`,
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

export const browserChecks: Check[] = [
  render,
  structure,
  overflowCheck,
  a11y,
  content,
  egress,
  consoleClean,
];
