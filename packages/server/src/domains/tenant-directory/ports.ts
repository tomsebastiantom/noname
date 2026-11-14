import type { TenantStatus } from "./schema";

export type TenantDirectoryEntry = {
  orgId: string;
  slug: string;
  status: TenantStatus;
  plan: string | null;
  region: string | null;
  excludedReason: string | null;
  provisioningState: "pending" | "in_progress" | "ready" | "failed";
  isPlatform: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantListFilter = {
  status?: TenantStatus;
  excludePlatform?: boolean;
  limit?: number;
};

export type UpsertTenantInput = {
  orgId: string;
  slug: string;
  status?: TenantStatus;
  plan?: string | null;
  region?: string | null;
  excludedReason?: string | null;
  provisioningState?: "pending" | "in_progress" | "ready" | "failed";
  isPlatform?: boolean;
};

/** Why a tenant may not be selected by a wave. `null` means selectable. */
export type TenantSelectability =
  | { selectable: true }
  | {
      selectable: false;
      reason:
        | "unknown_tenant"
        | "tenant_suspended"
        | "tenant_offboarding"
        | "tenant_excluded"
        | "tenant_not_ready"
        | "platform_org";
    };

export interface TenantDirectoryStore {
  list(filter: TenantListFilter): Promise<TenantDirectoryEntry[]>;
  get(orgId: string): Promise<TenantDirectoryEntry | null>;
  upsert(input: UpsertTenantInput): Promise<TenantDirectoryEntry>;
  /** Insert a row for every tenant_settings document that has no directory row yet. Returns rows created. */
  backfill(): Promise<number>;
}

export interface TenantDirectoryService extends TenantDirectoryStore {
  selectability(orgId: string): Promise<TenantSelectability>;
}
