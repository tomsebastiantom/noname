import { createAIPipelineRoutes } from "./api";
import { createAIPipeline } from "./service";
import type { AIPipeline } from "./ports";

export interface AIPipelineDomainDeps {
  pipeline?: AIPipeline;
}

export function createAIPipelineDomain(deps: AIPipelineDomainDeps = {}) {
  const pipeline = deps.pipeline ?? createAIPipeline();
  const routes = createAIPipelineRoutes(pipeline);
  return { pipeline, routes };
}
