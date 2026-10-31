/**
 * Minimal eval types — deliberately small.
 *
 * The full design (three modes, five layers, seven check families) is in
 * `docs/2026-10-24/RFC-EVAL-SERVICE.md`, but its own critical review
 * (`docs/2026-10-31/RFC-CRITICAL-REVIEW.md`) found that 17 checks were specified for three
 * known defects, and that one of them (`B1.structure`) cannot even be implemented — there is no
 * stable per-block marker in the rendered DOM.
 *
 * So this is the MVP slice: what can be proven today, with no browser, no queue and no modes.
 */

export type CheckLevel = "error" | "warn";

export type CheckStatus = "pass" | "fail" | "skip";

export type CheckResult = {
  /** Stable id from the RFC catalogue, e.g. "M4.machines". */
  id: string;
  status: CheckStatus;
  level: CheckLevel;
  /** Human sentence, never a stack trace. */
  detail: string;
  /** What the check was about (a route, a machine name). */
  subject?: string;
};

export type EvalResult = {
  checks: CheckResult[];
  /** Derived: no `error`-level failure. Never passed in. */
  passed: boolean;
};

/** The only I/O surface checks are allowed to use. */
export type EvalClient = {
  getJson<T>(
    path: string,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>;
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
};

export type Check = (ctx: CheckContext) => Promise<CheckResult[]>;
