import type { Database } from "../../drizzle";
import type { EvidenceService } from "../evidence/ports";
import { createPostgresEnvironmentStore, createPostgresReleaseStore } from "./adapters/postgres";
import { createReleaseRoutes } from "./api";
import { createEnvironmentService } from "./environment-service";
import type { EnvironmentService, ReleaseService, ReleaseStore } from "./ports";
import { createReleaseService } from "./service";

export { createEnvironmentService } from "./environment-service";
export type {
  CreateReleaseInput,
  EnvironmentService,
  EnvironmentStore,
  ReleaseArtifact,
  ReleaseArtifactInput,
  ReleaseArtifactKind,
  ReleaseDTO,
  ReleaseEnvironmentDTO,
  ReleaseService,
  ReleaseState,
  ReleaseStore,
} from "./ports";
export { createReleaseService } from "./service";

export function createReleaseDomain(deps: {
  db: Database;
  evidence?: EvidenceService;
  storage?: ReleaseStore;
}) {
  const storage = deps.storage ?? createPostgresReleaseStore(deps.db);
  const service: ReleaseService = createReleaseService(storage);
  const environments: EnvironmentService = createEnvironmentService(
    createPostgresEnvironmentStore(deps.db),
    service,
    deps.evidence,
  );
  return {
    storage,
    service,
    environments,
    routes: createReleaseRoutes(service, environments),
  };
}
