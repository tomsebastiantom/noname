import type { AgentRegistryStorage } from "../adapters/registry-postgres";
import type { LayoutPatchRevertDeps } from "../revert-layout-patch";
import type { AgentService } from "../ports";
import type { AgentRegistryService } from "../registry-service";

export interface AgentRouteDeps {
  service: AgentService;
  registry?: AgentRegistryService;
  registryStorage?: AgentRegistryStorage;
  layoutPatchRevert?: LayoutPatchRevertDeps;
}
