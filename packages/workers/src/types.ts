export interface EdgeContext {
  orgId: string;
  userId: string;
  role: string;
  roles?: string[];
  segment?: string;
}

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  API_ORIGIN: string;
  ZITADEL_ISSUER: string;
  ZITADEL_CLIENT_ID: string;
  ZITADEL_PROJECT_ID?: string;
  WORKER_SERVER_SECRET: string;
}
