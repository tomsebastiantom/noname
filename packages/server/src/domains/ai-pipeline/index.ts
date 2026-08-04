import type { SecretsService } from "../secrets/ports";
import { createAIPipelineRoutes } from "./api";
import type { AIPipeline } from "./ports";
import { createAIPipeline } from "./service";

export interface AIPipelineDomainDeps {
  service?: AIPipeline;
  secrets?: Pick<SecretsService, "resolveLLMProvider">;
}

export function createAIPipelineDomain(deps: AIPipelineDomainDeps = {}) {
  const service = deps.service ?? createAIPipeline({ secrets: deps.secrets });
  const routes = createAIPipelineRoutes(service);
  return { service, routes };
}
