import { createAIPipelineRoutes } from "./api";
import type { AIPipeline } from "./ports";
import { createAIPipeline } from "./service";

export interface AIPipelineDomainDeps {
  service?: AIPipeline;
}

export function createAIPipelineDomain(deps: AIPipelineDomainDeps = {}) {
  const service = deps.service ?? createAIPipeline();
  const routes = createAIPipelineRoutes(service);
  return { service, routes };
}
