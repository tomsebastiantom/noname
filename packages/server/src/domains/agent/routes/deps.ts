import type { AgentRegistryStorage } from "../adapters/registry-postgres";
import type { AgentService } from "../ports";
import type { AgentRegistryService } from "../registry-service";
import type { LayoutPatchRevertDeps } from "../revert-layout-patch";

export interface AgentRouteDeps {
  service: AgentService;
  registry?: AgentRegistryService;
  registryStorage?: AgentRegistryStorage;
  layoutPatchRevert?: LayoutPatchRevertDeps;
}
