import type { ProvisioningState, ProvisioningSteps } from "./schema";

export type ProvisioningRecord = {
  orgId: string;
  idempotencyKey: string;
  state: ProvisioningState;
  steps: ProvisioningSteps;
  requestedBy: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
};

export type CreateProvisioningInput = {
  /** Omitted → the ZITADEL org is created from the slug and becomes the tenant id. */
  orgId?: string;
  slug: string;
  idempotencyKey: string;
  requestedBy: string;
  /** Optional steps requested by the caller; today only the directory step is implemented. */
  seed?: boolean;
};

export type ProvisioningStore = {
  create(input: CreateProvisioningInput): Promise<ProvisioningRecord>;
  get(orgId: string): Promise<ProvisioningRecord | null>;
  findByIdempotencyKey(key: string): Promise<ProvisioningRecord | null>;
  update(
    orgId: string,
    patch: {
      state?: ProvisioningState;
      steps?: ProvisioningSteps;
      attempts?: number;
      lastError?: string | null;
      finishedAt?: Date | null;
    },
  ): Promise<ProvisioningRecord>;
};

export type ProvisioningService = {
  /** Idempotent: the same key (or an existing tenant) returns the existing record. */
  /** `created=false` means an existing record was returned (idempotent replay). */
  start(input: CreateProvisioningInput): Promise<{ record: ProvisioningRecord; created: boolean }>;
  get(orgId: string): Promise<ProvisioningRecord | null>;
  /** Runs the steps for one record. Separated so tests and a retry path can call it directly. */
  run(orgId: string): Promise<ProvisioningRecord>;
  /** Invites the first human admin into an already-provisioned tenant org. */
  invite(orgId: string, email: string): Promise<ProvisioningRecord>;
  /** Creates a record for every tenant that predates provisioning. */
  backfill(): Promise<{ examined: number; created: number }>;
};
