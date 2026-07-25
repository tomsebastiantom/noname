import { createAIPipelineRoutes } from "./api";
import type { AIPipeline } from "./ports";
import { createAIPipeline } from "./service";

export interface AIPipelineDomainDeps {
  pipeline?: AIPipeline;
}

export function createAIPipelineDomain(deps: AIPipelineDomainDeps = {}) {
  const pipeline = deps.pipeline ?? createAIPipeline();
  const routes = createAIPipelineRoutes(pipeline);
  return { pipeline, routes };
}
