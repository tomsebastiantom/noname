import type { EvidenceService } from "../evidence/ports";

/**
 * Gate verdict lookup — roadmap step 5.
 *
 * A wave may only promote a tenant whose *own* verification passed. Without this the rollout could move a tenant
 * that failed its checks, because eligibility only knew the catalog and the lifecycle status.
 *
 * The verdict is derived from the eval gate sink (`platform.eval.run` evidence records), never re-computed here:
 *
 *   missing     — no decision recorded for this tenant
 *   block       — the last decision was `blocked`
 *   unverified  — a pass, but from a different checks catalogue, or one that left required checks unverified
 *   pass        — a clean pass against the requested catalogue
 */
export type GateVerdictStatus = "pass" | "block" | "unverified" | "missing";

export type GateVerdict = {
  status: GateVerdictStatus;
  runId?: string;
  checksVersion?: string;
  recordedAt?: string;
  /** Why the verdict is not a clean pass; absent for `pass`. */
  reason?: "no_decision" | "checks_version_mismatch" | "unverified_checks" | "blocked";
};

export type VerdictInput = {
  orgId: string;
  /** The release's checks catalogue. A pass against a different catalogue is not a pass for this release. */
  checksVersion?: string | null;
};

export type VerdictAck = {
  orgId: string;
  releaseId: string;
  checksVersion?: string;
  reason: string;
  actorId: string;
};

export interface GateVerdictService {
  lookup(input: VerdictInput): Promise<GateVerdict>;
  /**
   * Record that an operator saw an `unverified` verdict and accepted the gap.
   *
   * This is deliberately **not** a promotion path: the verdict stays `unverified` and a wave still skips the tenant.
   * The acknowledgement is evidence — who accepted which gap, for which release, against which checks catalogue —
   * so the decision is attributable afterwards instead of living in a chat log. Turning `unverified` into `pass`
   * would quietly delete the fail-closed rule from D9.
   */
  acknowledge(input: VerdictAck): Promise<{ recorded: true }>;
}

type EvalRunData = {
  decision?: "pass" | "blocked";
  checksVersion?: string;
  counts?: { unverified?: number };
};

const EVAL_RUN_TYPE = "platform.eval.run";

export function createGateVerdictService(evidence?: EvidenceService): GateVerdictService {
  return {
    async acknowledge(input) {
      if (!evidence) throw new Error("evidence service is required to acknowledge a verdict");
      await evidence.audit({
        orgId: input.orgId,
        action: "platform.verdict.acknowledged",
        actorType: "user",
        actorId: input.actorId,
        subjectType: "release",
        subjectId: input.releaseId,
        reason: input.reason,
        metadata: { ...(input.checksVersion ? { checksVersion: input.checksVersion } : {}) },
      });
      return { recorded: true };
    },

    async lookup({ orgId, checksVersion }) {
      if (!evidence) return { status: "missing", reason: "no_decision" };

      const rows = await evidence.listRecords({ orgId, type: EVAL_RUN_TYPE, limit: 5 });
      const latest = rows[0];
      if (!latest) return { status: "missing", reason: "no_decision" };

      const data = (latest.data ?? {}) as EvalRunData;
      const verdictRun = data.checksVersion ?? undefined;

      if (data.decision === "blocked") {
        return {
          status: "block",
          reason: "blocked",
          runId: latest.correlationId ?? latest.id,
          ...(verdictRun ? { checksVersion: verdictRun } : {}),
          recordedAt: latest.recordedAt?.toISOString?.() ?? undefined,
        };
      }

      // A pass only counts for the catalogue the release ships with. Otherwise the tenant was verified against
      // different checks and the answer is "unverified", not "pass".
      if (checksVersion && verdictRun && checksVersion !== verdictRun) {
        return {
          status: "unverified",
          reason: "checks_version_mismatch",
          runId: latest.correlationId ?? latest.id,
          checksVersion: verdictRun,
          recordedAt: latest.recordedAt?.toISOString?.() ?? undefined,
        };
      }

      if ((data.counts?.unverified ?? 0) > 0) {
        return {
          status: "unverified",
          reason: "unverified_checks",
          runId: latest.correlationId ?? latest.id,
          ...(verdictRun ? { checksVersion: verdictRun } : {}),
          recordedAt: latest.recordedAt?.toISOString?.() ?? undefined,
        };
      }

      return {
        status: "pass",
        runId: latest.correlationId ?? latest.id,
        ...(verdictRun ? { checksVersion: verdictRun } : {}),
        recordedAt: latest.recordedAt?.toISOString?.() ?? undefined,
      };
    },
  };
}
