import type { Database } from "../../drizzle";
import type { SecretsService } from "../secrets/ports";
import { createAIGenerationStorage } from "./adapters/postgres";
import { createAIPipelineRoutes } from "./api";
import type { AIPipeline } from "./ports";
import { createAIPipeline } from "./service";

export interface AIPipelineDomainDeps {
  db?: Database;
  service?: AIPipeline;
  secrets?: Pick<SecretsService, "resolveLLMProvider">;
}

export function createAIPipelineDomain(deps: AIPipelineDomainDeps = {}) {
  const storage = deps.db ? createAIGenerationStorage(deps.db) : undefined;
  const service =
    deps.service ??
    createAIPipeline({
      secrets: deps.secrets,
      storage,
    });
  const routes = createAIPipelineRoutes(service);
  return { service, routes };
}
