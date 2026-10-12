export interface EdgeContext {
  orgId: string;
  userId: string;
  role: string;
  roles?: string[];
}

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  API_ORIGIN: string;
  ZITADEL_ISSUER: string;
  ZITADEL_CLIENT_ID: string;
  ZITADEL_PROJECT_ID?: string;
  /** Local dev only. Never set in deployed vars — see RoleLookupOptions. */
  ZITADEL_ALLOW_PROJECT_ID_FALLBACK?: string;
  WORKER_SERVER_SECRET: string;
}
