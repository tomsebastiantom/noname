import { recordEvalResult } from "../../shared/metrics";
import type { EvidenceService } from "../evidence/ports";

/**
 * Eval gate sink — mode `gate`.
 *
 * One Evidence record per decision (never per check): the audit kernel records that a release was allowed or
 * blocked and why, while per-check detail goes to metrics. This is the correction the critical review asked
 * for, and it is the shape the release-gate RFC consumes.
 */

export type EvalGateResult = {
  runId: string;
  checksVersion: string;
  passed: boolean;
  counts: { pass: number; fail: number; skip: number; unverified: number; flaky?: number };
  checks: Array<{ id: string; status: string; level: string; subject?: string }>;
};

export type EvalGateInput = {
  orgId: string;
  tenantSlug: string;
  result: EvalGateResult;
};

export type EvalGateDecision = {
  decision: "pass" | "blocked";
  evidenceId: string;
};

export async function recordGateDecision(
  evidence: EvidenceService,
  input: EvalGateInput,
): Promise<EvalGateDecision> {
  const decision = input.result.passed ? "pass" : "blocked";
  recordEvalResult(input.result);

  const failingCheckIds = input.result.checks
    .filter((check) => check.status === "fail" && check.level === "error")
    .map((check) => check.id)
    .slice(0, 50);

  const record = await evidence.appendRecord({
    orgId: input.orgId,
    type: "platform.eval.run",
    subjectType: "tenant.storefront",
    subjectId: input.tenantSlug,
    source: "eval.gate",
    correlationId: input.result.runId,
    idempotencyKey: `eval:${input.result.runId}:${input.result.checksVersion}`,
    data: {
      decision,
      checksVersion: input.result.checksVersion,
      counts: input.result.counts,
      failingCheckIds,
      flakyChecks: input.result.counts.flaky ?? 0,
      checkCount: input.result.checks.length,
    },
    occurredAt: new Date(),
  });

  return { decision, evidenceId: record.id };
}
