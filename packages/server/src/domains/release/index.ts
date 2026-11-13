import type { Database } from "../../drizzle";
import type { EvidenceService } from "../evidence/ports";
import {
  createPostgresChannelStore,
  createPostgresEnvironmentStore,
  createPostgresPointerStore,
  createPostgresReleaseStore,
} from "./adapters/postgres";
import { createReleaseRoutes } from "./api";
import { createChannelService } from "./channel-service";
import { createEnvironmentService } from "./environment-service";
import { createReleasePointerService } from "./pointer-service";
import type {
  ChannelService,
  EnvironmentService,
  ReleasePointerService,
  ReleaseRetention,
  ReleaseService,
  ReleaseStore,
} from "./ports";
import { createReleaseRetention } from "./retention";
import { createReleaseService } from "./service";

export { createChannelService } from "./channel-service";
export { createEnvironmentService } from "./environment-service";
export { createReleasePointerService } from "./pointer-service";
export type {
  ChannelService,
  ChannelStore,
  ClientBundleRef,
  CreateReleaseInput,
  EnvironmentService,
  EnvironmentStore,
  PointerStore,
  ReleaseArtifact,
  ReleaseArtifactInput,
  ReleaseArtifactKind,
  ReleaseChannelDTO,
  ReleaseDTO,
  ReleaseEnvironmentDTO,
  ReleasePointerService,
  ReleaseRetention,
  ReleaseService,
  ReleaseState,
  ReleaseStore,
  TenantReleasePointerDTO,
} from "./ports";
export { createReleaseRetention } from "./retention";
export { createReleaseService } from "./service";

export function createReleaseDomain(deps: {
  db: Database;
  evidence?: EvidenceService;
  storage?: ReleaseStore;
  /** Tenant inventory lookup: a wave may only name a tenant the directory knows and does not exclude. */
  selectability?: (orgId: string) => Promise<import("../tenant-directory/ports").TenantSelectability>;
  /** Per-tenant gate verdict: a tenant whose own verification did not pass is never eligible. */
  verdict?: (input: { orgId: string; checksVersion?: string | null }) => Promise<{
    status: "pass" | "block" | "unverified" | "missing";
    reason?: string;
  }>;
}) {
  const storage = deps.storage ?? createPostgresReleaseStore(deps.db);
  const service: ReleaseService = createReleaseService(storage);
  const channelStore = createPostgresChannelStore(deps.db);
  const channels: ChannelService = createChannelService(channelStore, service, deps.evidence);
  const environments: EnvironmentService = createEnvironmentService(
    createPostgresEnvironmentStore(deps.db),
    service,
    deps.evidence,
  );
  const pointer: ReleasePointerService = createReleasePointerService(
    createPostgresPointerStore(deps.db),
    channelStore,
    service,
    deps.evidence,
  );
  const retention: ReleaseRetention = createReleaseRetention(
    storage,
    createPostgresEnvironmentStore(deps.db),
    createPostgresPointerStore(deps.db),
    channelStore,
  );
  return {
    storage,
    service,
    channels,
    environments,
    pointer,
    retention,
    routes: createReleaseRoutes(service, environments, channels, pointer, retention, {
      ...(deps.selectability ? { selectability: deps.selectability } : {}),
      ...(deps.verdict ? { verdict: deps.verdict } : {}),
    }),
  };
}
