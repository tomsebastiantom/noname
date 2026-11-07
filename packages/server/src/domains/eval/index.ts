import type { CapabilityRegistry } from "../capabilities/registry";
import type { EvidenceService } from "../evidence/ports";
import type { TenantCatalogService } from "../tenant/ports";
import { createEvalRoutes } from "./api";

export type { EvalGateDecision, EvalGateInput, EvalGateResult } from "./gate";
export { recordGateDecision } from "./gate";

export function createEvalDomain(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
  evidence: EvidenceService;
}) {
  return {
    routes: createEvalRoutes(deps),
  };
}
