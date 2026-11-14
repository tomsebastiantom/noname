import type { Database } from "../../drizzle";
import { createTenantDirectoryPostgresStore } from "./adapters/postgres";
import { createTenantDirectoryRoutes } from "./api";
import type { TenantDirectoryService, TenantDirectoryStore } from "./ports";
import { createTenantDirectoryService } from "./service";

export type { TenantDirectoryEntry, TenantDirectoryService, TenantSelectability } from "./ports";
export { TENANT_STATUSES, type TenantStatus } from "./schema";

export function createTenantDirectoryDomain(deps: {
  db: Database;
  store?: TenantDirectoryStore;
  verdict?: (input: {
    orgId: string;
    checksVersion?: string | null;
  }) => Promise<{ status: "pass" | "block" | "unverified" | "missing"; reason?: string }>;
  acknowledge?: (input: {
    orgId: string;
    releaseId: string;
    reason: string;
    checksVersion?: string;
    actorId: string;
  }) => Promise<{ recorded: true }>;
}) {
  const store = deps.store ?? createTenantDirectoryPostgresStore(deps.db);
  const service: TenantDirectoryService = createTenantDirectoryService(store);
  return { service, routes: createTenantDirectoryRoutes(service, deps.verdict, deps.acknowledge) };
}
