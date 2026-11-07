import type { Database } from "../../drizzle";
import type { EvidenceService } from "../evidence/ports";
import {
  createPostgresEnvironmentStore,
  createPostgresPointerStore,
  createPostgresReleaseStore,
} from "./adapters/postgres";
import { createReleaseRoutes } from "./api";
import { createEnvironmentService } from "./environment-service";
import { createReleasePointerService } from "./pointer-service";
import type {
  EnvironmentService,
  ReleasePointerService,
  ReleaseService,
  ReleaseStore,
} from "./ports";
import { createReleaseService } from "./service";

export { createEnvironmentService } from "./environment-service";
export { createReleasePointerService } from "./pointer-service";
export type {
  ClientBundleRef,
  CreateReleaseInput,
  EnvironmentService,
  EnvironmentStore,
  PointerStore,
  ReleaseArtifact,
  ReleaseArtifactInput,
  ReleaseArtifactKind,
  ReleaseDTO,
  ReleaseEnvironmentDTO,
  ReleasePointerService,
  ReleaseService,
  ReleaseState,
  ReleaseStore,
  TenantReleasePointerDTO,
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
  const pointer: ReleasePointerService = createReleasePointerService(
    createPostgresPointerStore(deps.db),
    service,
    deps.evidence,
  );
  return {
    storage,
    service,
    environments,
    pointer,
    routes: createReleaseRoutes(service, environments, pointer),
  };
}
