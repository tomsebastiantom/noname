/**
 * Eval types — the contract every check and observer shares.
 *
 * The measurement layer is deliberately small: a check is a named function over a `CheckContext`,
 * it returns `CheckResult[]`, and `passed` is derived from those results. Gate verdicts, promotion
 * and Evidence-per-decision live in `docs/2026-11-07/RFC-RELEASE-GATE.md` — this package does not
 * decide whether a release may move.
 *
 * Two rules are encoded in the types rather than in prose:
 *  - a check that cannot run reports `skip`, never `pass`;
 *  - a result's level is `warn | error` (never `off`): `off` is configuration, resolved before a
 *    check runs, so a result that exists was actually evaluated.
 */

/** Cost tier (RFC §3). */
export type Tier = 0 | 1 | 2;

/** Configured level. `off` disables a check without a code change. */
export type Level = "off" | "warn" | "error";

/** Level a check can report. A check that ran cannot be `off`. */
export type ResultLevel = Exclude<Level, "off">;

export type CheckStatus = "pass" | "fail" | "skip";

export type CheckResult = {
  /** Stable id from the RFC catalogue, e.g. "M4.machines". */
  id: string;
  status: CheckStatus;
  level: ResultLevel;
  /** Human sentence, never a stack trace. */
  detail: string;
  /** What the check was about (a route, a machine name). */
  subject?: string;
  /** How many runs were aggregated into this result (RFC §5.1). */
  runs?: number;
  /** How many attempts this check took when a retry policy applied (>1 means it failed once). */
  attempts?: number;
  /** True when this result was served from the per-check cache. */
  reused?: boolean;
  /** What the UI can offer to fix it. */
  fix?: { kind: string; payload?: unknown };
};

export type EvalResult = {
  checks: CheckResult[];
  /** Derived: no `error`-level failure. Never passed in. */
  passed: boolean;
  counts: {
    pass: number;
    fail: number;
    skip: number;
    unverified: number;
    flaky: number;
    reused: number;
  };
  /** Stable id for this run (caller-supplied or generated). */
  runId: string;
  /** Hash of the catalogue + configured levels; changes when expectations change. */
  checksVersion: string;
  /** True when the result was served from the content-addressed cache rather than recomputed. */
  reused?: boolean;
  /** Cache key this result was stored under, when caching was active. */
  cacheKey?: string;
};

/**
 * Assertion overrides, Lighthouse-style: `off` disables a check without a code change, `warn` reports without
 * blocking, and `assertMatrix` lets a route pattern carry different expectations (checkout vs marketing).
 */
export type AssertionConfig = {
  assertions?: Record<string, Level>;
  assertMatrix?: Array<{ matchingRoute: string; assertions: Record<string, Level> }>;
  /** Retries for retryable checks when the first attempt fails. Defaults to 1. */
  retries?: number;
};

/** The only I/O surface checks are allowed to use. */
export type EvalClient = {
  getJson<T>(
    path: string,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>;
};

/** What a check needs to be planned: observers it requires, and ids it may emit. */
export type CheckNeed = "api" | "browser" | "manifest";

export type CheckMeta = {
  /** Stable group id, e.g. "M4.machines" or "R1.resolve". */
  id: string;
  tier: Tier;
  /** Level used when the caller does not configure one. */
  defaultLevel: ResultLevel;
  /** Observers that must exist for this check to run; otherwise it reports `skip`. */
  needs: CheckNeed[];
  /** Every result id the check may emit. Used to prove catalogue uniqueness. */
  emits: string[];
  /** Whether a failing result may be retried. Side-effecting checks (behaviour) must not set this. */
  retryable?: boolean;
  /** Cache scope: a single home page, each route, or the whole tenant. */
  scope?: "home" | "route" | "global";
  description: string;
};

/** A machine definition's state machine, reduced to what the manifest checks compare. */
export type MachineState = {
  on?: Record<string, { target?: string }>;
};

export type MachineDefinition = {
  name: string;
  states: Record<string, MachineState>;
};

/**
 * Facts the manifest observer produces: what the repository declares and what the API returned for each
 * definition. Checks compare these two values and never touch a filesystem or the network themselves.
 */
export type ManifestObservation = {
  files: MachineDefinition[];
  stored: Record<string, MachineDefinition | null>;
  /** False means the caller had no credential that can read definitions; checks must skip, not guess. */
  canReadDefinitions: boolean;
  /** Set when the API could not be read; checks report it rather than treating absent rows as "missing". */
  error?: string;
};

export type CheckContext = {
  client: EvalClient;
  tenantSlug: string;
  /** Local machine definition files — the source of truth the DB must match. */
  machinesDir: string;
  maxRoutes: number;
  /**
   * Whether the caller supplied a credential that can satisfy `MACHINES_DEFINE`. False means the
   * definition checks must report `skip` rather than guess.
   */
  canReadDefinitions: boolean;
  /** Dev policy: include draft layouts instead of only published ones. */
  includeDrafts?: boolean;
  /** Per-check cache (home checks and per-route HTTP checks); absent in gate/`--no-cache` runs. */
  checkCache?: import("./cache").CheckCache;
  /** Prefix for cache entries: org/tenant/release/platform/fleet/checks, without the route map. */
  cacheBaseKey?: string;
  /** route → spec hash, from the pre-step; used for per-route cache keys. */
  routeHashes?: Record<string, string>;
  /** Sweep policy: check at most N routes, chosen deterministically per tenant/day. Gate must not sample. */
  sampleLimit?: number;
  /** Day used for sample rotation (defaults to UTC today). */
  sampleDay?: string;
  /** Assertion overrides (levels, per-route matrix). Absent means the catalogue defaults. */
  config?: AssertionConfig;
  /** Caller-supplied run id; generated when absent. */
  runId?: string;
  /** Built by the runner when a selected check needs the manifest; never by a check. */
  manifest?: ManifestObservation;
  /**
   * Absent when no browser endpoint was supplied. Browser checks must then report `skip` with the reason —
   * never `pass`, and never silently omitted.
   */
  browser?: BrowserObserver;
  /** Storefront base URL the browser should visit, e.g. `http://yogastore.localhost:5173`. */
  siteBase?: string;
};

export type Check = {
  meta: CheckMeta;
  run(ctx: CheckContext): Promise<CheckResult[]>;
};

/** A single page visit, as the browser observer observed it. */
export type PageVisit = {
  url: string;
  status: number;
  title: string;
  /** Viewport width used for this visit. */
  width: number;
  /** Document scroll vs client width — horizontal overflow at this viewport. */
  overflow?: { scrollWidth: number; clientWidth: number };
  /** Length of the rendered body text — a blank SPA shell is a few characters, a rendered page is hundreds. */
  textLength: number;
  /** Full normalised body text (whitespace collapsed), for content-presence assertions. */
  text: string;
  /** First 300 characters of the rendered text, for the check's human sentence. */
  sample: string;
  /** Count of rendered blocks by `data-block-type` (the renderer contract B1.structure relies on). */
  nodesByType: Record<string, number>;
  /** axe-core violations for the RFC's rule subset, when requested. */
  a11y?: Array<{ id: string; impact: string; nodes: number }>;
  /** Design advisories (contrast), when requested — never a gate. */
  contrast?: Array<{ id: string; impact: string; nodes: number }>;
  /** Console errors raised during the visit. */
  consoleErrors: string[];
};

/**
 * Tier 2's I/O surface: visit a URL in a real browser.
 *
 * Checks never launch Chromium. Production provides browsers (the Kubernetes fleet), so the observer connects
 * to one; a fake implementation in tests needs no browser at all. See `observers/browser.ts`.
 */
export type EgressProbe = {
  target: string;
  /** True when the page could reach the target at all (an opaque no-cors response counts). */
  reachable: boolean;
};

export type CartFlow = {
  /** Whether an add-to-cart control was found and clicked. */
  clicked: boolean;
  before: string;
  after: string;
};

export type BrowserObserver = {
  visit(
    path: string,
    options?: { timeoutMs?: number; width?: number; a11y?: boolean; contrast?: boolean },
  ): Promise<PageVisit>;
  /** Attempt internal targets from inside the browser context; absent observers cannot run S1. */
  probeEgress?(targets: string[]): Promise<EgressProbe[]>;
  /** Add the first product on the home page to the cart; absent observers cannot run B5. */
  addFirstProductToCart?(): Promise<CartFlow>;
  close(): Promise<void>;
};
