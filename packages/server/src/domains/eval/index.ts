import type { CapabilityRegistry } from "../capabilities/registry";
import type { EvidenceService } from "../evidence/ports";
import type { TenantCatalogService } from "../tenant/ports";
import { createEvalRoutes, type EvalRoleContext } from "./api";
import { createEvalResultStore, type EvalResultStore } from "./results";
import { startEvalWorker } from "./worker";

export type { EvalRoleContext } from "./api";
export type { EvalGateDecision, EvalGateInput, EvalGateResult } from "./gate";
export { recordGateDecision } from "./gate";
export type { EvalJobData } from "./job";
export type { EvalResultStore } from "./results";

export function createEvalDomain(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
  evidence: EvidenceService;
  listRoles?: (orgId: string) => Promise<EvalRoleContext | null>;
  results?: EvalResultStore;
}) {
  return {
    routes: createEvalRoutes({
      ...deps,
      results: deps.results ?? createEvalResultStore(),
    }),
    worker: startEvalWorker(deps.evidence),
  };
}
