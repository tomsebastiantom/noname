import type { Database } from "../../drizzle";
import { createTenantProvisioningStore } from "./adapters/postgres";
import { createPlatformOperatorRoutes, createTenantProvisioningRoutes } from "./api";
import type { ProvisioningService } from "./ports";
import type { DirectoryPort } from "./service";
import { createTenantProvisioningService } from "./service";

export type { ProvisioningRecord, ProvisioningStore } from "./ports";
export { PROVISIONING_STATES, type ProvisioningState } from "./schema";

export function createTenantProvisioningDomain(deps: {
  db: Database;
  directory: DirectoryPort;
  provisioner?: import("./service").ProvisionerPort;
  audit?: (input: {
    action: string;
    actorId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  recordCredential?: (input: {
    orgId: string;
    accountId: string;
    accountName: string;
    roleKey: string;
    action?: "created" | "revoked";
  }) => Promise<void>;
}) {
  const store = createTenantProvisioningStore(deps.db);
  const service: ProvisioningService = createTenantProvisioningService(
    store,
    deps.directory,
    deps.provisioner,
    deps.recordCredential,
  );
  return {
    store,
    service,
    routes: createTenantProvisioningRoutes(service, deps.audit),
    operatorRoutes: createPlatformOperatorRoutes({
      invite: async ({ email }) => {
        const orgId = process.env.PLATFORM_ORG_ID?.trim();
        if (!orgId) throw new Error("PLATFORM_ORG_ID is required to create a platform operator");
        if (!deps.provisioner) throw new Error("no provisioner configured");
        return deps.provisioner.ensurePlatformOperator({ orgId, email });
      },
    }),
  };
}
