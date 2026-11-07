import type { Database } from "../../drizzle";
import { createPostgresReleaseStore } from "./adapters/postgres";
import { createReleaseRoutes } from "./api";
import type { ReleaseService, ReleaseStore } from "./ports";
import { createReleaseService } from "./service";

export type {
  CreateReleaseInput,
  ReleaseArtifact,
  ReleaseArtifactInput,
  ReleaseArtifactKind,
  ReleaseDTO,
  ReleaseService,
  ReleaseState,
  ReleaseStore,
} from "./ports";
export { createReleaseService } from "./service";

export function createReleaseDomain(deps: { db: Database; storage?: ReleaseStore }) {
  const storage = deps.storage ?? createPostgresReleaseStore(deps.db);
  const service: ReleaseService = createReleaseService(storage);
  return { storage, service, routes: createReleaseRoutes(service) };
}
