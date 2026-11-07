import type { CapabilityRegistry } from "../capabilities/registry";
import type { EvidenceService } from "../evidence/ports";
import type { TenantCatalogService } from "../tenant/ports";
import { createEvalRoutes, type EvalRoleContext } from "./api";
import { startEvalWorker } from "./worker";

export type { EvalRoleContext } from "./api";
export type { EvalGateDecision, EvalGateInput, EvalGateResult } from "./gate";
export { recordGateDecision } from "./gate";
export type { EvalJobData } from "./job";

export function createEvalDomain(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
  evidence: EvidenceService;
  listRoles?: (orgId: string) => Promise<EvalRoleContext | null>;
}) {
  return {
    routes: createEvalRoutes(deps),
    worker: startEvalWorker(deps.evidence),
  };
}
