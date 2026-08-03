import type { AgentService } from "../ports";
import type { AgentRegistryService } from "../registry-service";

export interface AgentRouteDeps {
  service: AgentService;
  registry?: AgentRegistryService;
}
