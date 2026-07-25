export interface EdgeContext {
  orgId: string;
  userId: string;
  role: string;
  segment?: string;
}

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  API_ORIGIN: string;
  ZITADEL_ISSUER: string;
  WORKER_SERVER_SECRET: string;
}
